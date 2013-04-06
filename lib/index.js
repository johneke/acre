(function () {

	mongoose = require('mongoose');
	ObjectId = mongoose.Types.ObjectId;

    var createVerb = "put";
    var updateVerb = "post";

    var UserCallback = function(operation, mode, path, callback){
		this.operation = operation;
		this.mode = mode;
		this.path = path;
		this.callback = callback;
    };

    var userCallbacks = [];

    var getUserCallback = function(operation, mode, path){
		for (var i in userCallbacks)
		{
			var userCallback = userCallbacks[i];
			if (userCallback.operation === operation && userCallback.mode === mode && new RegExp(userCallback.path, "i").test(path))
			{
				return userCallback.callback;
			}
		}
		return null;
    };

    var setRESTPaths = function (app, path, model)
    {
    	var preCreate = getUserCallback(acre.CREATE, acre.PRE, path);
    	var preRetrieve = getUserCallback(acre.RETRIEVE, acre.PRE, path);
    	var preUpdate = getUserCallback(acre.UPDATE, acre.PRE, path);
    	var preDelete = getUserCallback(acre.REMOVE, acre.PRE, path);

    	var postCreate = getUserCallback(acre.CREATE, acre.POST, path);
    	var postRetrieve = getUserCallback(acre.RETRIEVE, acre.POST, path);
    	var postUpdate = getUserCallback(acre.UPDATE, acre.POST, path);
    	var postDelete = getUserCallback(acre.REMOVE, acre.POST, path);

		var overrideCreate = getUserCallback(acre.CREATE, acre.OVERRIDE, path);
		var overrideRetrieve = getUserCallback(acre.RETRIEVE, acre.OVERRIDE, path);
		var overrideUpdate = getUserCallback(acre.UPDATE, acre.OVERRIDE, path);
		var overrideDelete = getUserCallback(acre.REMOVE, acre.OVERRIDE, path);

		// Create
		if (overrideCreate)
		{
			console.log(createVerb.toUpperCase() + " is user overriden for path: " + path);
		}
		else
		{
			console.log("setting " + createVerb.toUpperCase() + " URI for " + path);
			if (preCreate)
			{
				app[createVerb](path, preCreate, function(request, response){
					create(model, request, response, postCreate);
				});
			}
			else
			{
				app[createVerb](path, function(request, response){
					create(model, request, response, postCreate);
				});
			}
		}

		// Retrieve
		if (overrideRetrieve)
		{
			console.log("GET is user overriden for path: " + path);
		}
		else
		{
			console.log("setting GET URI for " + path);
			if (preRetrieve)
			{
				app.get(path, preRetrieve, function(request, response){
					retrieve(model, request, response, postRetrieve);
				});
			}
			else
			{
				app.get(path, function(request, response){
					retrieve(model, request, response, postRetrieve);
				});
			}
		}

		// Update
		if (overrideUpdate)
		{
			console.log(updateVerb.toUpperCase() + " is user overriden for path: " + path);
		}
		else
		{
			console.log("setting " + updateVerb.toUpperCase() + " URI for " + path);
			if (preUpdate)
			{
				app[updateVerb](path, preUpdate, function(request, response){
					update(model, request, response, postUpdate);
				});
			}
			else
			{
				app[updateVerb](path, function(request, response){
					update(model, request, response, postUpdate);
				});
			}
		}

		// Delete
		if (overrideDelete)
		{
			console.log("DELETE is user overriden for path: " + path);
		}
		else
		{
			console.log("setting DELETE URI for " + path);
			if (preDelete)
			{
				app["delete"](path, preDelete, function(request, response){
					erase(model, request, response, postDelete);
				});
			}
			else
			{
				app["delete"](path, function(request, response){
					erase(model, request, response, postDelete);
				});
			}
		}
    };

    var acre = {};

    acre.options = {
		rootPath: "",
		putIsCreate: true
    };

	acre.CREATE = "acre.CREATE";
	acre.RETRIEVE = "acre.RETRIEVE";
	acre.UPDATE = "acre.UPDATE";
	acre.REMOVE = "acre.REMOVE";

    acre.PRE = "acre.PRE";
    acre.POST = "acre.POST";
    acre.OVERRIDE = "acre.OVERRIDE";

    acre.bodyParser = function(app){
		app.use(function(req, res, next){
			if (req.is('text/*'))
			{
				req.text = '';
				req.setEncoding('utf8');
				req.on('data', function(chunk){
					req.text += chunk;
				});
				req.on('end', next);
			}
			else
			{
				next();
			}
		});
    };

    acre.init = function(app, options){
		if (options)
		{
			this.options.rootPath = options.rootPath || this.options.rootPath;
			this.options.putIsCreate = options.putIsCreate || this.options.putIsCreate;
		}

		if (!this.options.putIsCreate)
		{
			createVerb = "post";
			updateVerb = "put";
		}

		models = [];
		var i;

		for (i in mongoose.models)
		{
			models.push(mongoose.models[i]);
		}

		for (i in models)
		{
			serveModel(app, models[i]);
		}
	};

	acre.pre = function(operation, path, callback){
		var _path = path.replace(/:.*\//gi, ":.*/");
		if ([acre.CREATE, acre.RETRIEVE, acre.UPDATE, acre.REMOVE].indexOf(operation) !== -1)
		{
			var userCallback = new UserCallback(operation, acre.PRE, _path, callback);
			userCallbacks.push(userCallback);
		}
		else
		{
			throw operation + " is not a valid acre operation, must use one of: acre.CREATE, acre.RETRIEVE, acre.UPDATE, or acre.REMOVE";
		}
	};

	acre.post = function(operation, path, callback){
		var _path = path.replace(/:.*\//gi, ":.*/");
		if ([acre.CREATE, acre.RETRIEVE, acre.UPDATE, acre.REMOVE].indexOf(operation) !== -1)
		{
			var userCallback = new UserCallback(operation, acre.POST, _path, callback);
			userCallbacks.push(userCallback);
		}
		else
		{
			throw operation + " is not a valid acre operation, must use one of: acre.CREATE, acre.RETRIEVE, acre.UPDATE, or acre.REMOVE";
		}
	};

	acre.override = function(operation, paths)
	{
		if (Object.prototype.toString.call(paths) !== '[object Array]')
		{
			paths = [paths];
		}

		for (var i in paths)
		{
			var path = paths[i].replace(/:.*\//gi, ":.*/");
			if ([acre.CREATE, acre.RETRIEVE, acre.UPDATE, acre.REMOVE].indexOf(operation) !== -1)
			{
				var userCallback = new UserCallback(operation, acre.OVERRIDE, path, true);
				userCallbacks.push(userCallback);
			}
			else
			{
				throw operation + " is not a valid acre operation, must use one of: acre.CREATE, acre.RETRIEVE, acre.UPDATE, or acre.REMOVE";
			}
		}
	};

	var serveModel = function(app, Model) {
		var collection = Model.collection;
		var schema = Model.schema;

		console.log("serving model: " + Model.collection.name);

		var bindRoutes = function (uriPath, schemaPaths) {
			var processedObjects = [];
			var resource = uriPath.split("/").pop();
			var nestedUriPath = uriPath + "/:" + resource + "_id";
			for (var path in schemaPaths)
			{
				var propertyDesc = schema.paths[path];
				if (String(path).indexOf(".") !== -1 )
				{
					// nested object detected
					var objName = path.split(".")[0];
					if (processedObjects.indexOf(objName) === -1)
					{
						var newPaths = {};
						for (var _path in schemaPaths)
						{
							if (_path.indexOf(objName+".") === 0)
							{
								newPaths[_path.replace(objName+".", "")] = schemaPaths[_path];
							}
						}
						processedObjects.push(objName);
						bindRoutes(nestedUriPath + "/" + objName, newPaths);
					}
				}
				else if (schemaPaths[path].schema)
				{
					// nested array of objects detected
					bindRoutes(nestedUriPath + "/" + path, schemaPaths[path].schema.paths);
				}
				else
				{
					// we do not want to expose any mods to _id attribute
					if (path !== "_id")
					{
						// native property detected
						setRESTPaths(app, nestedUriPath + "/" + path, Model);
					}
				}
			}

			/**
			 * CRUD for objects
			 */
			setRESTPaths(app, nestedUriPath, Model);

			/**
			 * CRUD for root paths
			 */
			setRESTPaths(app, uriPath, Model);
		};


		var path = acre.options.rootPath + "/" + collection.name;
		bindRoutes(path, schema.paths);
	};

	var create = function(Model, request, response, callback){
		var path = request.route.path;
		console.log("retrieve path: " + path);
		try
		{
			if (isModelRootPath(Model, path))
			{
				Model.create(request.body, function(error, model){
					if (error)
					{
						respondError(response, 500, "failed to create new " + Model.collection.name + ", error: " + error.message);
					}
					else
					{
						if (callback)
						{
							callback(request, response, model);
						}
						else
						{
							respondSuccess(response, "created " + Model.collection.name);
						}
					}
				});
			}
			else
			{
				// permit deletion of objects from arrays
				var modelId = request.params[Model.collection.name + "_id"];
				Model.findById(modelId, function(error, model) {
					if (error)
					{
						respondError(response, 500, "failed to find " + Model.collection.name + " with id: " + modelId);
					}
					else
					{
						if (!model)
						{
							respondError(response, 500, "failed to find " + Model.collection.name + " with id: " + modelId);
						}
						else
						{
							var keys = path.split("/");
							//remove first three elements
							//these correspond to blank(""), model and its id
							console.log("keys before shift");
							console.log(keys);
							keys.shift();
							keys.shift();
							keys.shift();
							console.log("keys after shift");
							console.log(keys);
							console.log("model id:");
							console.log(model._id);

							var createSubObj = function(_object, keys)
							{
								console.log("object: ");
								console.log(_object);
								console.log("keys");
								console.log(keys);

								if (keys.length === 0)
								{
									// creating on root resource
									console.log("create to root resource is not allowed");
									respondError(response, 400, "bad request");
									return false;
								}
								else if (keys.length === 1)
								{
									// inserting into nested array or object
									if (keys[0].indexOf(":") === 0)
									{
										console.log("trying to create nested object on non array");
										respondError(response, 405, "not allowed to create on non array");
										return false;
									}
									else
									{
										// updating nested property
										if (Object.prototype.toString.call(_object[keys[0]]) === '[object Array]')
										{
											_object[keys[0]].push(request.body);
											return true;
										}

										console.log("trying to create nested object on non array");
										respondError(response, 405, "not allowed to create on non array");
										return false;
									}
								}
								else
								{
									if (keys[0].indexOf(":") === 0)
									{
										var key = keys[0].replace(":", "");
										var param = request.params[key];
										if (Object.prototype.toString.call(_object) === '[object Array]')
										{
											for (var i in _object)
											{
												if (_object[i]._id == param)
												{
													console.log("recursing on nested array object");
													return createSubObj(_object[i], keys.slice(1));
												}
											}

											console.log("failed to find nested array object");
											respondError(response, 404, "nested array object not found");
											return false;
										}
										else if (Object.prototype.toString.call(_object) === '[object Object]')
										{
											if (_object._id == param)
											{
												console.log("recursing on nested object");
												return createSubObj(_object, keys.slice(1));
											}
											else
											{
												console.log("asked for object with id that doesnt match");
												respondError(response, 400, "bad request");
												return false;
											}
										}

										console.log("uri specifies id, which neither refers to an array nor an object");
										respondError(response, 400, "bad request");
										return false;
									}
									else
									{
										if (!_object[keys[0]])
										{
											console.log("failed to find key: " + keys[0] + " in object");
											respondError(response, 400, "bad request");
											return false;
										}
										else
										{
											console.log("recursing with object at key: " + keys[0]);
											return createSubObj(_object[keys[0]], keys.slice(1));
										}
									}
								}
							};

							var success = createSubObj(model, keys);
							if (success)
							{
								console.log("model to save: ");
								console.log(model);
								model.save(function(error, model){
									if (error)
									{
										respondError(response, 500, "failed to insert object at: " + request.path + ", error: " + error.message);
									}
									else
									{
										if (callback)
										{
											callback(request, response, model);
										}
										else
										{
											respondSuccess(response, "inserted object at path " + request.path);
										}
									}
								});
							}
						}
					}
				});
			}
		}
		catch(e)
		{
			console.log("exception occured: ");
			console.log(e);
			respondError (response, 400, "Bad Request");
		}
	};

	var retrieve = function(Model, request, response, callback){
		var path = request.route.path;
		console.log("retrieve path: " + path);
		try
		{
			if (isModelRootPath(Model, path))
			{
				Model.find(function(error, models){
					if (error)
					{
						respondError(response, 500, "failed to fetch all " + Model.collection.name);
					}
					else
					{
						if (!models)
						{
							models = [];
						}

						if (callback)
						{
							callback(request, response, models);
						}
						else
						{
							respondJson(response, models);
						}
					}
				});
			}
			else
			{
				var modelId = request.params[Model.collection.name + "_id"];
				Model.findById(modelId, function(error, model) {
					if (error)
					{
						respondError(response, 500, "failed to find " + Model.collection.name + " with id: " + modelId);
					}
					else
					{
						if (!model)
						{
							respondError(response, 500, "failed to find " + Model.collection.name + " with id: " + modelId);
						}
						else
						{
							var keys = path.split("/");

							//remove first three elements
							//these correspond to blank(""), model and its id
							console.log("keys before shift");
							console.log(keys);
							keys.shift();
							keys.shift();
							keys.shift();
							console.log("keys after shift");
							console.log(keys);
							console.log("model id:");
							console.log(model._id);

							var fetchSubObj = function(_object, keys)
							{
								console.log("object: ");
								console.log(_object);
								console.log("keys");
								console.log(keys);

								var key, param, i;

								if (keys.length === 0)
								{
									// fetch root resource
									console.log("returning root resource");
									return _object;
								}
								else if (keys.length === 1)
								{
									// fetching nested array or object
									if (keys[0].indexOf(":") === 0)
									{
										key = keys[0].replace(":", "");
										param = request.params[key];
										if (Object.prototype.toString.call(_object) === '[object Array]')
										{
											for (i in _object)
											{
												if (_object[i]._id == param)
												{
													console.log("returning nested array object");
													return _object[i];
												}
											}

											respondError(response, 404, "attribute not found");
										}
										else if (Object.prototype.toString.call(_object) === '[object Object]')
										{
											if (_object._id == param)
											{
												console.log("returning nested object");
												return _object;
											}

											respondError(response, 404, "attribute not found");
											return null;
										}
										else
										{
											console.log("item isnt an array or object, 400");
											respondError(response, 400, "bad request");
											return null;
										}
									}
									// fetching nested property
									else
									{
										if (Object.prototype.toString.call(_object) === '[object Object]')
										{
											console.log("returning object property");
											return _object[keys[0]];
										}
										else
										{
											console.log("asked for property but no obj found");
											respondError(response, 400, "bad request");
											return null;
										}
									}
								}
								else
								{
									if (keys[0].indexOf(":") === 0)
									{
										key = keys[0].replace(":", "");
										param = request.params[key];
										if (Object.prototype.toString.call(_object) === '[object Array]')
										{
											for (i in _object)
											{
												if (_object[i]._id == param)
												{
													console.log("recursing on nested array object");
													return fetchSubObj(_object[i], keys.slice(1));
												}
											}
										}
										else if (Object.prototype.toString.call(_object) === '[object Object]')
										{
											if (_object._id == param)
											{
												console.log("recursing on nested object");
												return fetchSubObj(_object, keys.slice(1));
											}
											else
											{
												console.log("asked for object with id that doesnt match");
												respondError(response, 400, "bad request");
												return null;
											}
										}
										else
										{
											respondError(response, 400, "bad request");
											return null;
										}

										console.log("uri specifies id, but object is neither array nor object");
										respondError(response, 404, "resource attribute not found");
										return null;
									}
									else
									{
										if (!_object[keys[0]])
										{
											console.log("failed to find key: " + keys[0] + " in object");
											respondError(response, 400, "bad request");
											return null;
										}
										else
										{
											console.log("recursing with object at key: " + keys[0]);
											return fetchSubObj(_object[keys[0]], keys.slice(1));
										}
									}
								}
							};

							var data = fetchSubObj(model, keys);
							if (data)
							{
								if (callback)
								{
									callback(request, response, data);
								}
								else
								{
									if (Object.prototype.toString.call(data) === '[object Object]' || Object.prototype.toString.call(data) === '[object Array]')
									{
										respondJson(response, data);
									}
									else
									{
										respondSuccess(response, data);
									}
								}
							}
						}
					}
				});
			}
		}
		catch(e)
		{
			console.log("exception occured: ");
			console.log(e);
			respondError (response, 400, "Bad Request");
		}
	};

	var update = function(Model, request, response, callback){
		var path = request.route.path;
		console.log("update path: " + path);
		try
		{
			if (isModelRootPath(Model, path))
			{
				respondError(response, 405, "not allowed to " + updateVerb + " to " + Model.collection.name + ", must update specific resources");
			}
			else
			{
				var modelId = request.params[Model.collection.name + "_id"];
				Model.findById(modelId, function(error, model) {
					if (error)
					{
						respondError(response, 500, "failed to find " + Model.collection.name + " with id: " + modelId);
					}
					else
					{
						if (!model)
						{
							respondError(response, 500, "failed to find " + Model.collection.name + " with id: " + modelId);
						}
						else
						{
							var keys = path.split("/");
							//remove first three elements
							//these correspond to blank(""), model and its id
							console.log("keys before shift");
							console.log(keys);
							keys.shift();
							keys.shift();
							keys.shift();
							console.log("keys after shift");
							console.log(keys);
							console.log("model id:");
							console.log(model._id);

							var updateSubObj = function(_object, keys)
							{
								console.log("object: ");
								console.log(_object);
								console.log("keys");
								console.log(keys);

								if (keys.length === 0)
								{
									// update root resource
									console.log("trying to update root resource");
									respondError(response, 405, updateVerb + " to root resource not allowed, can only " + updateVerb + " to properties with no children");
									return false;
								}
								else if (keys.length === 1)
								{
									// updating nested array or object
									if (keys[0].indexOf(":") === 0)
									{
										console.log("trying to update nested object");
										respondError(response, 405, updateVerb + " to object not allowed, can only " + updateVerb + " to properties with no children");
										return false;
									}
									else
									{
										// updating nested property
										if (Object.prototype.toString.call(_object) === '[object Object]')
										{
											console.log("updating  object property");
											//first make sure we are updating an object with no sub objects
											var type = Object.prototype.toString.call(_object[keys[0]]);
											if (type === '[object Object]' || type === '[object Array]')
											{
												console.log("trying to update nested object or array");
												respondError(response, 405, updateVerb + " to object not allowed, can only " + updateVerb + " to properties with no children");
												return false;
											}

											_object[keys[0]] = request.text;
											return true;
										}
										else
										{
											console.log("tried to save nested property but target is not an object");
											respondError(response, 400, "bad request");
											return false;
										}
									}
								}
								else
								{
									if (keys[0].indexOf(":") === 0)
									{
										var key = keys[0].replace(":", "");
										var param = request.params[key];
										if (Object.prototype.toString.call(_object) === '[object Array]')
										{
											for (var i in _object)
											{
												if (_object[i]._id == param)
												{
													console.log("recursing on nested array object");
													return updateSubObj(_object[i], keys.slice(1));
												}
											}
											console.log("failed to find nested array object");
											return false;
										}
										else if (Object.prototype.toString.call(_object) === '[object Object]')
										{
											if (_object._id == param)
											{
												console.log("recursing on nested object");
												return updateSubObj(_object, keys.slice(1));
											}
											else
											{
												console.log("asked for object with id that doesnt match");
												respondError(response, 400, "bad request");
												return false;
											}
										}
										else
										{
											respondError(response, 400, "bad request");
											return false;
										}

										console.log("uri specifies id, but object is neither array nor object");
										respondError(response, 404, "resource attribute not found");
										return false;
									}
									else
									{
										if (!_object[keys[0]])
										{
											console.log("failed to find key: " + keys[0] + " in object");
											respondError(response, 400, "bad request");
											return false;
										}
										else
										{
											console.log("recursing with object at key: " + keys[0]);
											return updateSubObj(_object[keys[0]], keys.slice(1));
										}
									}
								}
							};

							var success = updateSubObj(model, keys);
							if (success)
							{
								model.save(function(error, model){
									if (error)
									{
										respondError(response, 500, "failed to update " + Model.collection.name + " at id: " + modelId + ", error: " + error.message);
									}
									else
									{
										if (callback)
										{
											callback(request, response, model);
										}
										else
										{
											respondSuccess(response, "updated " + Model.collection.name + " at id: " + modelId);
										}
									}
								});
							}
						}
					}
				});
			}
		}
		catch(e)
		{
			console.log("exception occured: ");
			console.log(e);
			respondError (response, 400, "Bad Request");
		}
	};

	var erase = function(Model, request, response, callback){
		var path = request.route.path;
		console.log("retrieve path: " + path);
		try
		{
			if (isModelRootPath(Model, path))
			{
				// delete all resources
				Model.remove(function(error, models){
					if (error)
					{
						respondError(response, 500, "failed to delete all " + Model.collection.name + ", error: " + error.message);
					}
					else
					{
						if (callback)
						{
							callback(request, response, null);
						}
						else
						{
							respondSuccess(response, "deleted all " + Model.collection.name);
						}
					}
				});
			}
			else
			{
				var modelId = request.params[Model.collection.name + "_id"];
				if (isModelRootResourcePath(Model, path))
				{
					// delete single resource
					Model.findByIdAndRemove(modelId, function(error, model){
						if (error)
						{
							respondError(response, 500, "failed to delete " + Model.collection.name + " at id: " + modelId + ", error: " + error.message);
						}
						else
						{
							if (callback)
							{
								callback(request, response, null);
							}
							else
							{
								respondSuccess(response, "deleted " + Model.collection.name + " at id: " + modelId);
							}
						}
					});
				}
				else
				{
					// permit deletion of objects from arrays
					Model.findById(modelId, function(error, model) {
						if (error)
						{
							respondError(response, 500, "failed to find " + Model.collection.name + " with id: " + modelId);
						}
						else
						{
							if (!model)
							{
								respondError(response, 500, "failed to find " + Model.collection.name + " with id: " + modelId);
							}
							else
							{
								var keys = path.split("/");
								//remove first three elements
								//these correspond to blank(""), model and its id
								console.log("keys before shift");
								console.log(keys);
								keys.shift();
								keys.shift();
								keys.shift();
								console.log("keys after shift");
								console.log(keys);
								console.log("model id:");
								console.log(model._id);

								var eraseSubObj = function(_object, keys)
								{
									console.log("object: ");
									console.log(_object);
									console.log("keys");
									console.log(keys);

									var key, param, i;

									if (keys.length === 0)
									{
										// deleting root resource, we should never get here
										console.log("trying to delete root resource, technically we should never get here, something is wrong");
										respondError(response, 400, "");
										return false;
									}
									else if (keys.length === 1)
									{
										// erasing nested array or object
										if (keys[0].indexOf(":") === 0)
										{
											key = keys[0].replace(":", "");
											param = request.params[key];
											if (Object.prototype.toString.call(_object) === '[object Array]')
											{
												for (i in _object)
												{
													if (_object[i]._id == param)
													{
														console.log("erasing nested array object");
														_object.splice(i, 1);
														return true;
													}
												}

												respondError(response, 404, "nested array object not found");
												return false;
											}

											console.log("trying to update nested object");
											respondError(response, 405, "not allowed to delete non array, use " + updateVerb + " instead");
											return false;
										}
										else
										{
											// updating nested property
											console.log("trying to delete nested property");
											respondError(response, 405, "not allowed to delete non array, use " + updateVerb + " instead");
											return false;
										}
									}
									else
									{
										if (keys[0].indexOf(":") === 0)
										{
											key = keys[0].replace(":", "");
											param = request.params[key];
											if (Object.prototype.toString.call(_object) === '[object Array]')
											{
												for (i in _object)
												{
													if (_object[i]._id == param)
													{
														console.log("recursing on nested array object");
														return eraseSubObj(_object[i], keys.slice(1));
													}
												}

												console.log("failed to find nested array object");
												respondError(response, 404, "nested array object not found");
												return false;
											}
											else if (Object.prototype.toString.call(_object) === '[object Object]')
											{
												if (_object._id == param)
												{
													console.log("recursing on nested object");
													return eraseSubObj(_object, keys.slice(1));
												}
												else
												{
													console.log("asked for object with id that doesnt match");
													respondError(response, 400, "bad request");
													return false;
												}
											}

											console.log("uri specifies id, which neither refers to an array nor an object");
											respondError(response, 400, "bad request");
											return false;
										}
										else
										{
											if (!_object[keys[0]])
											{
												console.log("failed to find key: " + keys[0] + " in object");
												respondError(response, 400, "bad request");
												return false;
											}
											else
											{
												console.log("recursing with object at key: " + keys[0]);
												return eraseSubObj(_object[keys[0]], keys.slice(1));
											}
										}
									}
								};

								var success = eraseSubObj(model, keys);
								if (success)
								{
									console.log("model to save: ");
									console.log(model);
									model.save(function(error, model){
										if (error)
										{
											respondError(response, 500, "failed to delete object at: " + request.path + ", error: " + error.message);
										}
										else
										{
											if (callback)
											{
												callback(request, response, null);
											}
											else
											{
												respondSuccess(response, "deleted object at path " + request.path);
											}
										}
									});
								}
							}
						}
					});
				}
			}
		}
		catch(e)
		{
			console.log("exception occured: ");
			console.log(e);
			respondError (response, 400, "Bad Request");
		}
	};

	var isModelRootPath = function(Model, path)
	{
		return acre.options.rootPath + "/" + Model.collection.name === path;
	};

	var isModelRootResourcePath = function(Model, path)
	{
		return acre.options.rootPath + "/" + Model.collection.name + "/:" + Model.collection.name + "_id"  === path;
	};

	var respondSuccess = function(response, str) {
		response.send(200, String(str));
	};

	var respondJson = function(response, json) {
		response.json(json);
	};

	var respondError = function(response, code, err)
	{
		response.send(code, err);
	};

    module.exports = acre;
}());