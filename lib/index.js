(function () {

	mongoose = require('mongoose');
	ObjectId = mongoose.Types.ObjectId;

    var acre = {};

    acre.options = {
		rootPath: "",
		putIsCreate: true
    };

    var createVerb = "put";
    var updateVerb = "post";

    acre.middleware = {};

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
    	
		var Model, name, _i, _len;

		Models = (function() {
			var _ref, _results;
			_ref = mongoose.models;
			_results = [];
			for (name in _ref) {
				Model = _ref[name];
				_results.push(Model);
			}
			return _results;
		})();

		primeServer(app, Models);
	};

	acre.pre = function(action, path, callback){

	};

	acre.post = function(action, path, callback){

	};

	acre.override = function(action, path, callback){

	};

	/*
	 * hidden, 'private' functions
	 */

	var primeServer = function(app, Models) {
	 	for (i in Models)
	 	{
	 		serveModel(app, Models[i]);
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
			for (path in schemaPaths)
			{
				var propertyDesc = schema.paths[path];
				if (new String(path).indexOf(".") !== -1 )
				{
					// nested object detected
					var objName = path.split(".")[0];
					if (processedObjects.indexOf(objName) === -1)
					{
						var newPaths = {};
						for (_path in schemaPaths)
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

						// Create
						app[createVerb](nestedUriPath + "/" + path, function(request, response){
							create(Model, nestedUriPath + "/" + path, request, response);
						});

						// Retrieve
						console.log("setting GET URI for: " + nestedUriPath + "/" + path);
						app.get(nestedUriPath + "/" + path, function(request, response){
							retrieve(Model, nestedUriPath + "/" + path, request, response);
						});

						// Update
						app[updateVerb](nestedUriPath + "/" + path, function(request, response){
							update(Model, nestedUriPath + "/" + path, request, response);
						});

						// Delete
						app["delete"](nestedUriPath + "/" + path, function(request, response){
							erase(Model, nestedUriPath + "/" + path, request, response);
						});
					}
				}
			}

			/**
			 * CRUD for objects
			 */

			// Create
			app[createVerb](nestedUriPath, function(request, response){
				create(Model, nestedUriPath, request, response);
			});

			// Retrieve
			console.log("setting GET URI for: " + nestedUriPath);
			app.get(nestedUriPath, function(request, response){
				retrieve(Model, nestedUriPath, request, response);
			});

			// Update
			app[updateVerb](nestedUriPath, function(request, response){
				update(Model, nestedUriPath, request, response);
			});

			// Delete
			app["delete"](nestedUriPath, function(request, response){
				erase(Model, nestedUriPath, request, response);
			});


			/**
			 * CRUD for root paths
			 */

			// Create
			app[createVerb](uriPath, function(request, response){
				create(Model, uriPath, request, response);
			});

			// Retrieve
			console.log("setting GET URI for: " + uriPath);
			app.get(uriPath, function(request, response){
				retrieve(Model, uriPath, request, response);
			});

			// Update
			app[updateVerb](uriPath, function(request, response){
				update(Model, uriPath, request, response);
			});

			// Delete
			app["delete"](uriPath, function(request, response){
				erase(Model, uriPath, request, response);
			});
		};


		var path = acre.options.rootPath + "/" + collection.name;
		bindRoutes(path, schema.paths);

	};

	var extractObjectWithKeys = function (obj, keys)
	{
		var obj = {};
		for (key in keys)
		{
			value = keys[key];
			if (-1 !== keys.indexOf(key))
			{
				obj[key] = value;
			}
		}
	};

	var create = function(Model, path, request, response){
		
	};

	var retrieve = function(Model, path, request, response){
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
							respondJson(response, []);
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
							//remove first two elements
							//these correspond to model and its id
							keys.shift();
							keys.shift();

							var fetchSubObj = function(object, keys)
							{
								if (keys.length === 0)
								{
									// fetch root resource
									return object;
								}
								else if (keys.length === 1)
								{
									// fetching nested array or object
									if (keys[0].indexOf(":") === 0)
									{
										var key = keys[0].replace(":", "");
										var param = request.params[key];
										if (Object.prototype.toString.call(object) === '[object Array]')
										{
											for (i in object)
											{
												if (object[i]._id.equals(new ObjectId(param)))
												{
													return object[i];
												}
											}

											respondError(response, 404, "attribute not found");
										}
										else if (Object.prototype.toString.call(object) === '[object Object]')
										{
											if (object._id.equals(new ObjectId(param)))
											{
												return object;
											}

											respondError(response, 404, "attribute not found");
										}
										else
										{
											respondError(response, 400, "bad request");
										}
									}
									// fetching nested property
									else
									{
										if (Object.prototype.toString.call(object) === '[object Object]')
										{
											return object[keys[0]];
										}
										else
										{
											respondError(response, 400, "bad request");
										}
									}
								}
								else
								{
									if (!object[keys[0]])
									{
										respondError(response, 400, "bad request");
									}
									else
									{
										if (keys[0].indexOf(":") === 0)
										{
											var key = keys[0].replace(":", "");
											var param = request.params[key];
											if (Object.prototype.toString.call(object) === '[object Array]')
											{
												for (i in object)
												{
													if (object[i]._id.equals(new ObjectId(param)))
													{
														return fetchSubObj(object[i], keys.slice(1));
													}
												}
											}
											else if (Object.prototype.toString.call(object) === '[object Object]')
											{
												if (object._id.equals(new ObjectId(param)))
												{
													return fetchSubObj(object, keys.slice(1));
												}
												else
												{
													respondError(response, 400, "bad request");
												}
											}
											else
											{
												respondError(response, 400, "bad request");
											}

											respondError(response, 404, "resource attribute not found");
										}
										else
										{
											return fetchSubObj(object[keys[0]], keys.slice(1));
										}
									}

								}
							};

							respondJson(response, fetchSubObj(model, keys)); 
						}
					}
				})
			}
		}
		catch(e)
		{
			consol.log("exception occured: ");
			console.log(e);
			respondError (response, 400, "Bad Request");
		}
	};

	var update = function(Model, path, request, response){
		if (isModelRootPath(Model, path))
		{
			respondError(response, 400, "cannot update: " + path);
		}

		var modelId = request.params[Model.collection.name + "_id"];
		try
		{
			Model.findById(modelId, function(error, model) {
				if (error != null) 
				{
					respondError(response, 500, "error fetching " + Model.collection.name + " with id: " + modelId)
				}
				else
				{
					if (model != null) 
					{
						var keys = path.split("/");
						//remove first element
						//it corresponds to the model
						keys.shift();
						keys.shift();

						var updateSubObj = function(object, keys){
							if (keys.length == 0)
							{
								//updating root resource
								object = request.body;
							}
							else if (keys.length == 1)
							{
								// updating nested array or object
								if (keys[0].indexOf(":") === 0)
								{
									var key = keys[0].replace(":", "");
									var param = request.params[key];
									var found = false;
									if (Object.prototype.toString.call(object) === '[object Array]')
									{
										for (i in object)
										{
											if (object[i]._id.equals(new ObjectId(param)))
											{
												found = true;
												object[i] = request.body;
												break;
											}
										}
									}
									else if (Object.prototype.toString.call(object) === '[object Object]')
									{
										if (object._id.equals(new ObjectId(param)))
										{
											found = true;
											object = request.body;
										}
									}
									else
									{
										respondError(response, 400, "bad request");
									}

									if (!found)
									{
										respondError(response, 404, "resource attribute not found");
									}
								}
								// updating nested property
								else
								{
									if (Object.prototype.toString.call(object) === '[object Object]')
									{
										object[keys[0]] = request.body;
									}
									else
									{
										respondError(response, 400, "bad request");
									}
								}
							}
							else
							{
								if (!object[keys[0]])
								{
									respondError(response, 400, "bad request");
								}
								else
								{
									if (keys[0].indexOf(":") === 0)
									{
										var key = keys[0].replace(":", "");
										var param = request.params[key];
										var found = false;
										if (Object.prototype.toString.call(object) === '[object Array]')
										{
											for (i in object)
											{
												if (object[i]._id.equals(new ObjectId(param)))
												{
													found = true;
													updateObj(object[i], keys.slice(1));
													break;
												}
											}
										}
										else if (Object.prototype.toString.call(object) === '[object Object]')
										{
											if (object._id.equals(new ObjectId(param)))
											{
												found = true;
												updateObj(object, keys.slice(1));
											}
										}
										else
										{
											respondError(response, 400, "bad request");
										}

										if (!found)
										{
											respondError(response, 404, "resource attribute not found");
										}
									}
									else
									{
										updateObj(object[keys[0]], keys.slice(1));
									}
								}
							}
						};
						updateSubObj(model, keys);

						model.save(function(error, model){
							if (error)
							{
								respondError(response, 400, error.message);
							}
							else
							{
								respondSuccess(response, Model.collection.name + " updated");
							}
						});
					} 
					else 
					{
						respondError(response, 404, "no " + Model.collection.name + " exists with id: " + modelId);
					}
				}
			});
		}
		catch(e)
		{
			consol.log("exception occured: ");
			console.log(e);
			respondError (response, 400, "Bad Request");
		}
	};

	var erase = function(Model, path, request){
		
	};

	var isModelRootPath = function(Model, path)
	{
		return acre.options.rootPath + "/" + Model.collection.name === path;
	}

	var respondSuccess = function(response, str) {
		response.send(200, str);
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