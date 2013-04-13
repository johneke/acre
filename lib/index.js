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

    var heirarchy = {
		ROOT: "HEIRARCHY_ROOT",
		BRANCH: "HEIRARCHY_BRANCH",
		LEAF: "HEIRARCHY_LEAF"
    };

    var traverseObjectHeirarchy = function(model, request, response, callback){
		if (!model || !model._id)
		{
			respondError(response, 500, "invalid model");
			callback("invalid model", null, null);
		}
		else
		{
			var path = request.route.path;
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

			var traverseSubObjectHeirarchy = function(_object, keys, callback)
			{
				console.log("object: ");
				console.log(_object);
				console.log("keys");
				console.log(keys);

				var key, param, i, type, found;

				if (keys.length === 0)
				{
					// return root resource
					console.log("returning root resource");
					callback(null, heirarchy.ROOT, _object, null);
				}
				else if (keys.length === 1)
				{
					// returning nested array or object
					if (keys[0].indexOf(":") === 0)
					{
						key = keys[0].replace(":", "");
						param = request.params[key];
						if (Object.prototype.toString.call(_object) === '[object Array]')
						{
							found = false;
							for (i in _object)
							{
								if (_object[i]._id == param)
								{
									console.log("returning nested array object");
									type = Object.prototype.toString.call(_object[i]);
									switch (type)
									{
										case '[object Object]':
											callback(null, heirarchy.BRANCH, _object, i);
											break;

										case '[object String]':
										case '[object Date]':
										case '[object Number]':
											callback(null, heirarchy.LEAF, _object, i);
											break;

										default:
											respondError(response, 400,  "nested property of type: " + type + " not supported");
											callback("nested property of type: " + type + " not supported", null, null);
											break;
									}

									found = true;
									break;
								}
							}

							if (!found)
							{
								console.log("object with id: " + param + " doesnt exist in array");
								respondError(response, 404, "target object not found");
								callback("object with id: " + param + " doesnt exist in array", null, null);
							}
						}
						else if (Object.prototype.toString.call(_object) === '[object Object]')
						{
							if (_object._id == param)
							{
								console.log("returning nested object");
								callback(null, heirarchy.BRANCH, _object, null);
							}
							else
							{
								console.log("target object with id: " + param + "not found");
								respondError(response, 404, "target object not found");
								callback("target object with id: " + param + "not found", null, null);
							}
						}
						else
						{
							console.log("current item isnt an array or object, 400");
							respondError(response, 400, "bad request");
							callback("current item isnt an array or object, 400", null, null);
						}
					}
					// fetching nested property
					else
					{
						if (Object.prototype.toString.call(_object) === '[object Object]')
						{
							type = Object.prototype.toString.call(_object[keys[0]]);
							switch (type)
							{
								case '[object Object]':
									console.log("returning object property");
									callback(null, heirarchy.BRANCH, _object, keys[0]);
									break;

								case '[object Array]':
									console.log("returning object property");
									callback(null, heirarchy.BRANCH, _object, keys[0]);
									break;

								case '[object String]':
								case '[object Date]':
								case '[object Number]':
									console.log("returning object property");
									callback(null, heirarchy.LEAF, _object, keys[0]);
									break;

								default:
									console.log("nested property of type: " + type + " not supported");
									respondError(response, 400,  "nested property of type: " + type + " not supported");
									callback("nested property of type: " + type + " not supported", null, null);
									break;
							}
						}
						else
						{
							console.log("asked for property but no object found");
							respondError(response, 400, "bad request");
							callback("asked for property but no object found", null, null);
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
							found = false;
							for (i in _object)
							{
								if (_object[i]._id == param)
								{
									console.log("recursing on nested array object");
									traverseSubObjectHeirarchy(_object[i], keys.slice(1), callback);
									found = true;
									break;
								}
							}

							if (!found)
							{
								console.log("uri specifies id, but array has no object with that id");
								respondError(response, 404, "target object not found");
								callback("uri specifies id, but array has no object with that id", null, null);
							}
						}
						else if (Object.prototype.toString.call(_object) === '[object Object]')
						{
							if (_object._id == param)
							{
								console.log("recursing on nested object");
								traverseSubObjectHeirarchy(_object, keys.slice(1), callback);
							}
							else
							{
								console.log("asked for object with id that doesnt match");
								respondError(response, 400, "bad request");
								callback("asked for object with id that doesnt match", null, null);
							}
						}
						else
						{
							console.log("uri specifies id, but object is neither array nor object");
							respondError(response, 400, "bad request");
							callback("uri specifies id, but object is neither array nor object", null, null);
						}
					}
					else
					{
						if (!_object[keys[0]])
						{
							console.log("failed to find key: " + keys[0] + " in object");
							respondError(response, 400, "bad request");
							callback("failed to find key: " + keys[0] + " in object", null, null);
						}
						else
						{
							console.log("recursing with object at key: " + keys[0]);
							traverseSubObjectHeirarchy(_object[keys[0]], keys.slice(1), callback);
						}
					}
				}
			};

			traverseSubObjectHeirarchy(model, keys, callback);
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
		var _path = "^" + path.replace(/:.*\//gi, ":.*/") + "$";
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
		var _path = "^" + path.replace(/:.*\//gi, ":.*/") + "$";
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
			var path = "^" + paths[i].replace(/:.*\//gi, ":.*/") + "$";
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
				// permit addition of objects to arrays
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
							traverseObjectHeirarchy(model, request, response, function(error, object_heirarchy, parent, key){
								if (error)
								{
									console.log("error occured : " + error);								}
								else
								{
									if (object_heirarchy === heirarchy.BRANCH && Object.prototype.toString.call(parent[key]) === '[object Array]')
									{
										parent[key].push(request.body);
										model.save(function(error, model){
											if (error)
											{
												console.log("error saving object to: " + request.originalUrl + " error: " + error.message);
												respondError(response, 500, "error saving object to: " + request.originalUrl);
											}
											else
											{
												respondSuccess(response, "create done");
											}
										});
									}
									else
									{
										console.log("cannot " + createVerb + " to " + request.originalUrl);
										respondError(response, 405, "cannot " + createVerb + " to " + request.originalUrl);
									}
								}
							});
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
						console.log("failed to find model with id: " + modelId);
						respondError(response, 404, "failed to find " + Model.collection.name + " with id: " + modelId);
					}
					else
					{
						if (!model)
						{
							console.log("failed to find model with id: " + modelId);
							respondError(response, 404, "failed to find " + Model.collection.name + " with id: " + modelId);
						}
						else
						{
							traverseObjectHeirarchy(model, request, response, function(error, object_heirarchy, parent, key){
								if (error)
								{
									console.log("error occred: " + error);
								}
								else
								{
									var object = (key) ? parent[key] : parent;
									switch (Object.prototype.toString.call(object))
									{
										case '[object Array]':
										case '[object Object]':
											respondJson(response, object);
											break;

										default:
											respondSuccess(response, object);
											break;
									}
								}
							});
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
							respondError(response, 404, "failed to find " + Model.collection.name + " with id: " + modelId);
						}
						else
						{
							traverseObjectHeirarchy(model, request, response, function(error, object_heirarchy, parent, key){
								if (error)
								{
									console.log("error occured: " + error);
								}
								else
								{
									if (object_heirarchy === heirarchy.LEAF)
									{
										if (typeof(request.text) != "undefined")
										{
											parent[key] = request.text;
											model.save(function(error, model){
												if (error)
												{
													console.log("error occured updating object at path: " + request.originalUrl + " error: " + error.message);
													respondError(response, 500, "failed to update: " + request.originalUrl + " error: " + error.message);
												}
												else
												{
													console.log("update done");
													respondSuccess(response, "update sucessful");
												}
											});
										}
										else
										{
											console.log("request.text undefined, acre bodyParser probably not set up");
											respondError(response, 500, "request.text undefined, acre bodyParser not setup");
										}
									}
									else
									{
										console.log("update not supported for object heirarchy type: " + object_heirarchy);
										respondError(response, 405, "update not allowed to: " + request.originalUrl);
									}
								}
							});
						}
					}
				});
			}
		}
		catch(e)
		{
			console.log("exception occured: ");
			console.log(e);
			respondError (response, 500, "Internal Error");
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
							console.log("failed to find object with id: " + modelId + ", error: " + error.message);
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
								traverseObjectHeirarchy(model, request, response, function(error, object_heirarchy, parent, key){
									if (error)
									{
										console.log("error occured: " + error);
									}
									else
									{
										if (object_heirarchy == heirarchy.BRANCH)
										{
											switch (Object.prototype.toString.call(parent[key]))
											{
												case '[object Array]':
													delete parent[key];
													model.save(function(error, model){
														if (error)
														{
															console.log("failed to delete array item, error: " + error.message);
															respondError(response, 500, "delete failed, error: " + error.message);
														}
														else
														{
															console.log("delete done");
															respondSuccess(response, "delete done");
														}
													});
													break;

												default:
													console.log("unsupported delete operation");
													respondError(response, 405, "cannot delete " + request.originalUrl);
													break;
											}
										}
										else
										{
											console.log("unsupported delete operation");
											respondError(response, 405, "cannot delete " + request.originalUrl);
										}
									}
								});
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