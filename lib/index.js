(function () {

	express = require('express');
	ejs = require('ejs');
	inflect = require('i')();
	_ = require('lodash');
	when = require('when');

	var mongoose, ObjectId;

    var createVerb = "put";
    var updateVerb = "post";

    function UserCallback (operation, mode, path, callback)
    {
		this.operation = operation;
		this.mode = mode;
		this.path = path;
		this.callback = callback;
    }

    function DynamicRouteData (viewPath, contentType, options, modelName)
    {
    	this.viewPath = viewPath;
    	this.contentType = contentType;
    	this.options = _.cloneDeep(options);
    	this.modelName = modelName;
    }

    var userCallbacks = [];
    var dynamicRouteData = {};

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

    var setRESTPaths = function (app, path, Model)
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

		console.log("setting up CRUD REST paths for: " + path);

		// Create
		if (overrideCreate)
		{
			console.log(createVerb.toUpperCase() + " is user overriden for path: " + path);
		}
		else
		{
			if (preCreate)
			{
				app[createVerb](path, preCreate, function(request, response){
					create(Model, request, response, postCreate);
				});
			}
			else
			{
				app[createVerb](path, function(request, response){
					create(Model, request, response, postCreate);
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
			if (preRetrieve)
			{
				app.get(path, preRetrieve, function(request, response){
					retrieve(Model, request, response, postRetrieve);
				});
			}
			else
			{
				app.get(path, function(request, response){
					retrieve(Model, request, response, postRetrieve);
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
			if (preUpdate)
			{
				app[updateVerb](path, preUpdate, function(request, response){
					update(Model, request, response, postUpdate);
				});
			}
			else
			{
				app[updateVerb](path, function(request, response){
					update(Model, request, response, postUpdate);
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
			if (preDelete)
			{
				app["delete"](path, preDelete, function(request, response){
					erase(Model, request, response, postDelete);
				});
			}
			else
			{
				app["delete"](path, function(request, response){
					erase(Model, request, response, postDelete);
				});
			}
		}
    };

	var findModel = function(modelName)
	{
		for (i in mongoose.models)
		{
			var Model = mongoose.models[i];
			if (Model.modelName === modelName)
			{
				return when.resolve(Model);
			}
		}

		return when.reject('failed to find model: ' + modelName);
	};

	var storeForeignKeys = function(Models)
	{
		var i, result = {};
		var _storeForeignKeys = function(tree, path, Model)
		{
			var i;
			for (i in tree)
			{
				if (i === 'id' || i === '_id')
				{
					continue;
				}

				var _path = (path === '') ? i : path + '.' + i;

				if (
					(_.isPlainObject(tree[i]) && !_.isUndefined(tree[i].ref)) || 
					(_.isArray(tree[i]) && tree[i].length === 1 && !_.isUndefined(tree[i][0].ref))
					)
				{
					if (_.isUndefined(acre.foreignKeys[Model.modelName]))
					{
						acre.foreignKeys[Model.modelName] = {};
					}

					acre.foreignKeys[Model.modelName][_path] = (_.isArray(tree[i])) ? tree[i][0].ref : tree[i].ref;
				}
				else if (_.isPlainObject(tree[i]))
				{
					_storeForeignKeys(tree[i], _path, Model);
				}
				else if (_.isArray(tree[i]))
				{
					_storeForeignKeys(tree[i][0], _path, Model);
				}
			}
		};

		for (i in Models)
		{
			_storeForeignKeys(Models[i].schema.tree, '', Models[i]);
		}
	};

	/**
	 * Given a model, composes a default instantiation of a mongoose model
	 * @param Model - mongoose model descriptor
	 * @returns - an array containing default instantiated model, and a version of the default instantiated model for form generation
	 */
    var composeDefaultInstance = function(Model)
    {
		var modelInstance, formInstance, i, j, k;

		/*
		 * strips the tree down to bare data, leaf elements will either be
		 * empty strings ("") or a list of options in the case of a ref
		 * field
		 */
		var stripTree = function(tree, path)
		{
			var i, result = {};
			for (i in tree)
			{
				if (i === 'id' || i === '_id')
				{
					continue;
				}

				var _path = (path === '') ? i : path + '.' + i;

				if (
					(_.isPlainObject(tree[i]) && !_.isUndefined(tree[i].ref)) || 
					(_.isArray(tree[i]) && tree[i].length === 1 && !_.isUndefined(tree[i][0].ref))
					)
				{
					result[i] = (_.isArray(tree[i])) ? [] : '';
				}
				else if (_.isPlainObject(tree[i]))
				{
					result[i] = stripTree(tree[i], _path);
				}
				else if (_.isArray(tree[i]))
				{
					if (i === 'validate')
					{
						continue;
					}
					else
					{
						result[i] = [stripTree(tree[i][0], _path)];
					}
				}
			}

			if (Object.keys(result).length === 0)
			{
				return "";
			}

			return result;
		};

		var tree = _.cloneDeep(Model.schema.tree);
		modelInstance = stripTree(tree, '');
		formInstance = _.cloneDeep(modelInstance);

		if (_.isUndefined(acre.foreignKeys) || 
			Object.keys(acre.foreignKeys).length === 0 || 
			 _.isUndefined(acre.foreignKeys[Model.modelName]) || 
			 Object.keys(acre.foreignKeys[Model.modelName]).length === 0)
		{
			return when.resolve([modelInstance, formInstance]);
		}
		else
		{
			var foreignKeys = Object.keys(acre.foreignKeys[Model.modelName]), defereds = {}, defered = when.defer();
			_.each(foreignKeys, function(key){
				var defered = when.defer();
				defereds[key] = defered;
				findModel(acre.foreignKeys[Model.modelName][key])
					.then(
						function(_Model){
							_Model.find(function(error, models){
								if (error)
								{
									defered.reject('failed to fetch models for ref: ' + _Model.modelName);
								}
								else
								{
									if (!models)
									{
										models = [];
									}

									var crumbs = key.split('.');
									var ref = formInstance, obj, field;

									for (j = 0; j < crumbs.length; j++)
									{
										var crumb = crumbs[j];
										if (j === crumbs.length - 1)
										{
											if (_.isArray(ref[crumb]))
											{
												obj = ref[crumb];
												field = 0;
											}
											else
											{
												obj = ref;
												field = crumb;
											}
											break;
										}
										else
										{
											if (_.isPlainObject(ref[crumb]))
											{
												ref = ref[crumb];
											}
											else if (_.isArray(ref[crumb]))
											{
												ref = ref[crumb][0];
											}
											else
											{
												defered.reject('cannot handle object type: ' + typeof(ref[crumb]));
												break;
											}
										}
									}

									if (_.isUndefined(obj) || _.isUndefined(field))
									{
										defered.reject('failed to find ref for ' + _Model.modelName + ' in: ' + JSON.stringify(formInstance));
									}
									else
									{
										if (_.isArray(obj[field]))
										{
											obj[field] = [{
												type: 'select',
												options: models
											}];
										}
										else
										{
											obj[field] = {
												type: 'select',
												options: models
											};
										}
										
										defered.resolve();
									}
								}
							});
						},
						function(err){
							defered.reject(err);
						}
					);
			});

			var promises = _.values(defereds).map(function(defered){
				return defered.promise;
			});

			when.all(promises)
				.then(
					function(){
						defered.resolve([modelInstance, formInstance]);
					},
					function(err){
						defered.reject(err);
					}
				);

			return defered.promise;
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
			keys.shift();
			keys.shift();
			keys.shift();

			var traverseSubObjectHeirarchy = function(_object, keys, callback)
			{
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
								if ((_object[i] instanceof ObjectId && _object[i] == param) || _object[i]._id == param)
								{
									console.log("returning nested array object");
									type = Object.prototype.toString.call(_object[i]);
									switch (type)
									{
										case '[object Object]':
											if (_object[i] instanceof ObjectId)
											{
												callback(null, heirarchy.LEAF, _object, i);
											}
											else
											{
												callback(null, heirarchy.BRANCH, _object, i);
											}
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
						else
						{
							console.log("current item isnt an array, 400");
							respondError(response, 400, "requested array operation on non array resource");
							callback("requested array operation on non array resource, 400", null, null);
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
									if(_object[keys[0]] instanceof ObjectId)
									{
										// represents an id, so actually a leaf
										callback(null, heirarchy.LEAF, _object, keys[0]);
									}
									else
									{
										callback(null, heirarchy.BRANCH, _object, keys[0]);
									}
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
						else if (_.isPlainObject(_object))
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
		rootPath: '',
		putIsCreate: true,
		adminPortal: true,
		adminRoute: '/admin',
		appName: 'Acre App',
		adminUserName: 'admin',
		adminPassword: 'acre123'
    };

	acre.foreignKeys = {};

	acre.CREATE = "acre.CREATE";
	acre.RETRIEVE = "acre.RETRIEVE";
	acre.UPDATE = "acre.UPDATE";
	acre.REMOVE = "acre.REMOVE";

    acre.PRE = "acre.PRE";
    acre.POST = "acre.POST";
    acre.OVERRIDE = "acre.OVERRIDE";

    acre.bodyParser = function(app)
    {
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

    acre.init = function(_mongoose, app, options)
    {
    	mongoose = _mongoose;
    	ObjectId = mongoose.Types.ObjectId;

    	if (mongoose.version !== '3.5.7')
    	{
    		return when.reject('using incompatible mongoose version: ' + mongoose.version + ', acre requires 3.5.7');
    	}

		_.merge(this.options, options);

		if (!this.options.putIsCreate)
		{
			createVerb = "post";
			updateVerb = "put";
		}

		var promises = [], models = _.values(mongoose.models);

		storeForeignKeys(models);

		promises.push(serveModels(app, models));
		if (this.options.adminPortal)
		{
			promises.push(bindAdminRoutes(app, models));
		}

		return when.all(promises);
	};

	acre.pre = function(operation, path, callback)
	{
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

	acre.post = function(operation, path, callback)
	{
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

	var serveModels = function(app, Models)
	{
		var bindRoutes = function (uriPath, schemaPaths, resourceIsArray, Model) {
			var processedObjects = [];
			var resource = uriPath.split("/").pop();
			var nestedUriPath;
			if (resourceIsArray)
			{
				var modelName = (isModelRootPath(Model, uriPath)) ? Model.modelName : inflect.singularize(resource).toLowerCase();
				nestedUriPath = uriPath + "/:" + modelName + "_id";
			}
			else
			{
				nestedUriPath = uriPath;
			}

			for (var path in schemaPaths)
			{
				var propertyDesc = Model.schema.paths[path];
				if (String(path).indexOf(".") !== -1)
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
						bindRoutes(nestedUriPath + "/" + objName, newPaths, false, Model);
					}
				}
				else if (schemaPaths[path].schema)
				{
					// nested array of objects detected
					bindRoutes(nestedUriPath + "/" + path, schemaPaths[path].schema.paths, true, Model);
				}
				else
				{
					// we do not want to expose any mods to _id attribute
					if (path !== "_id")
					{
						// plain property detected
						setRESTPaths(app, nestedUriPath + "/" + path, Model);
						if (!_.isUndefined(propertyDesc) && !_.isUndefined(propertyDesc.options))
						{
							if (_.isArray(propertyDesc.options.type) && propertyDesc.options.type.length > 0 && !_.isUndefined(propertyDesc.options.type[0].ref))
							{
								setRESTPaths(app, nestedUriPath + "/" + path + "/:" + propertyDesc.options.type[0].ref + "_id", Model);
							}
						}
					}
				}
			}

			/**
			 * CRUD for root resource
			 */
			setRESTPaths(app, nestedUriPath, Model);

			if (nestedUriPath != uriPath)
			{
				/**
				 * CRUD for root
				 */
				setRESTPaths(app, uriPath, Model);
			}
		};

		for (var i in Models)
		{
			var Model = Models[i];
			console.log('serving model: ' + Model.modelName);
			var path = acre.options.rootPath + "/" + Model.collection.name;
			bindRoutes(path, Model.schema.paths, true, Model);
		}

		return when.resolve();
	};

	var bindAdminRoutes = function(app, models)
	{

		var i, j, k, routePath, viewPath;
		var jsPaths = [], cssPaths = [], _models = [];

		var serveRoute = function()
		{
			return function(request, response){
				var routeData = dynamicRouteData[request.path];
				if (_.isUndefined(routeData))
				{
					respondError(response, 500, 'failed to find data for route: ' + request.originalUrl);
				}
				else
				{
					var viewPath = routeData.viewPath, 
						contentType = routeData.contentType, 
						options = routeData.options, 
						modelName = routeData.modelName;
					function renderFile(options)
					{
						ejs.renderFile(viewPath, options, function(error, page){
							if (error)
							{
								respondError(response, 500, 'ejs failed to render page: " + viewPath + ", error: ' + error);
							}
							else
							{
								response.set('Content-Type', contentType);
								response.send(page);
							}
						});
					}

					if (modelName)
					{
						// we have to load this everytime
						findModel(modelName)
							.then(
								function(Model){
									composeDefaultInstance(Model)
										.then(
											function(instances){
												options.instance = instances[0];
												options.formDesc = instances[1];
												renderFile(options);
											},
											function(err){
												respondError(response, 500, 'failed to compose default instance for: ' + modelName + ', err: ' + err);
											}
										);
								},
								function(err){
									respondError(response, 500, 'failed to find model: ' + modelName + ', err: ' + err);
								}
							);
					}
					else
					{
						renderFile(options);
					}
				}
			};
		};

		var serveFile = function(path)
		{
			app.get(acre.options.adminRoute + path, function(request, response){
				response.sendfile(__dirname + '/portal/public' + path);
			});

			return acre.options.adminRoute + path;
		};

		cssPaths.push(serveFile('/css/bootstrap-combined.min.css'));
		cssPaths.push(serveFile('/css/acre.css'));
		jsPaths.push(serveFile('/js/angular.min.js'));
		jsPaths.push(serveFile('/js/angular-resource.min.js'));
		jsPaths.push(serveFile('/js/ui-bootstrap-tpls-0.3.0.min.js'));
		jsPaths.push(serveFile('/js/lodash.min.js'));
		jsPaths.push(serveFile('/js/restangular.min.js'));
		jsPaths.push(serveFile('/js/ng-form-direct.js'));
		jsPaths.push(serveFile('/js/ng-object-view.js'));
		jsPaths.push(serveFile('/js/inflect.min.js'));
		jsPaths.push(serveFile('/js/controller-utils.js'));

		for (i in models)
		{
			var modelName = models[i].modelName;
			var createRoutePath = acre.options.adminRoute + "/" + modelName + "-create.html";
			var retrieveRoutePath = acre.options.adminRoute + "/" + modelName + "-retrieve.html";
			var updateRoutePath = acre.options.adminRoute + "/" + modelName + "-update.html";
			var controllersPath = acre.options.adminRoute + "/js/" + modelName + "-controllers.js";

			var model = {
				name: modelName,
				module: {
					name: modelName
				},
				collection: models[i].collection.name,
				controllers: {
					create: modelName + "CreateController",
					retrieve: modelName + "RetrieveController",
					update: modelName + "UpdateController"
				},
				views: {
					create: createRoutePath,
					retrieve: retrieveRoutePath,
					update: updateRoutePath
				}
			};

			dynamicRouteData[createRoutePath] = new DynamicRouteData(__dirname + '/portal/views/admin-model-create-view.ejs', 'text/html', {model: model}, modelName);
			dynamicRouteData[retrieveRoutePath] = new DynamicRouteData(__dirname + '/portal/views/admin-model-retrieve-view.ejs', 'text/html', {model: model}, null);
			dynamicRouteData[updateRoutePath] = new DynamicRouteData(__dirname + '/portal/views/admin-model-update-view.ejs', 'text/html', {model: model}, modelName);
			dynamicRouteData[controllersPath] = new DynamicRouteData(__dirname + '/portal/views/js/admin-model-controllers.ejs', 'text/javascript', {model: model, createVerb: createVerb.toUpperCase(), updateVerb: updateVerb.toUpperCase()}, modelName);
			
			app.get(createRoutePath, serveRoute());
			app.get(retrieveRoutePath, serveRoute());
			app.get(updateRoutePath, serveRoute());
			app.get(controllersPath, serveRoute());

			jsPaths.push(controllersPath);
			_models.push(model);
		}

		routePath = acre.options.adminRoute + '/js/admin-controllers.js';
		dynamicRouteData[_.clone(routePath)] = new DynamicRouteData(__dirname + '/portal/views/js/admin-controllers.ejs', 'text/javascript', {models: _models}, null);
		app.get(_.clone(routePath), serveRoute());
		jsPaths.push(_.clone(routePath));

		routePath = acre.options.adminRoute + "/js/admin-module.js";
		dynamicRouteData[_.clone(routePath)] = new DynamicRouteData(__dirname + '/portal/views/js/admin-module.ejs', 'text/javascript', {models: _models, apiRoute: acre.options.rootPath}, null);
		app.get(_.clone(routePath), serveRoute());
		jsPaths.push(_.clone(routePath));

		routePath = acre.options.adminRoute;
		dynamicRouteData[_.clone(routePath)] = new DynamicRouteData(__dirname + '/portal/views/admin-home.ejs', 'text/html', {
			models: _models,
			js: jsPaths,
			css: cssPaths,
			apiRoute: acre.options.rootPath,
			appName: acre.options.appName
		}, null);
		app.get(_.clone(routePath), express.basicAuth(acre.options.adminUserName, acre.options.adminPassword), serveRoute());

		return when.resolve();
	};

	var create = function(Model, request, response, callback)
	{
		var path = request.route.path;
		console.log("create path: " + path);
		try
		{
			if (isModelRootPath(Model, path))
			{
				Model.create(request.body, function(error, model){
					if (error)
					{
						respondError(response, 500, "failed to create new " + Model.modelName + ", error: " + error.message);
					}
					else
					{
						if (callback)
						{
							callback(request, response, model);
						}
						else
						{
							respondSuccess(response, "created " + Model.modelName);
						}
					}
				});
			}
			else
			{
				// permit addition of objects to arrays
				var modelId = request.params[Model.modelName + "_id"];
				Model.findById(modelId, function(error, model) {
					if (error)
					{
						respondError(response, 500, "failed to find " + Model.modelName + " with id: " + modelId);
					}
					else
					{
						if (!model)
						{
							respondError(response, 500, "failed to find " + Model.modelName + " with id: " + modelId);
						}
						else
						{
							traverseObjectHeirarchy(model, request, response, function(error, object_heirarchy, parent, key){
								if (error)
								{
									console.log("error occured : " + error);								
								}
								else
								{
									if (_.isArray(parent[key]))
									{
										if (request.is('text/*'))
										{
											if (!_.isUndefined(request.text))
											{
												// adding to array of refs
												parent[key].push(request.text);
											}
											else
											{
												console.log("request.text undefined, acre bodyParser probably not set up");
												respondError(response, 500, "request.text undefined, acre bodyParser not setup");
											}
										}
										else
										{
											// adding nested resource to nested array
											parent[key].push(request.body);
										}

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

	var retrieve = function(Model, request, response, callback)
	{
		var path = request.route.path;
		console.log("retrieve path: " + path);
		try
		{
			var handleFind, hndl;
			if (isModelRootPath(Model, path))
			{
				handleFind = function(error, models)
				{
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
				};

				hndl = Model.find();
			}
			else
			{
				handleFind = function(error, model)
				{
					if (error)
					{
						console.log("failed to find model with id: " + modelId);
						respondError(response, 404, "failed to find " + Model.modelName + " with id: " + modelId);
					}
					else
					{
						if (!model)
						{
							console.log("failed to find model with id: " + modelId);
							respondError(response, 404, "failed to find " + Model.modelName + " with id: " + modelId);
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
									//TODO for some reason _.isPlainObject and _.isArray always return false here
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
				};

				var modelId = request.params[Model.modelName + "_id"];
				var hndl = Model.findById(modelId);
			}

			if (!_.isUndefined(acre.foreignKeys[Model.modelName]) && _.isPlainObject(acre.foreignKeys[Model.modelName]))
			{
				var refs = _.keys(acre.foreignKeys[Model.modelName]);
				_.each(refs, function(ref){
					hndl.populate(ref);
				});
			}

			hndl.exec(handleFind);
		}
		catch(e)
		{
			console.log("exception occured: ");
			console.log(e);
			respondError (response, 400, "Bad Request");
		}
	};

	var update = function(Model, request, response, callback)
	{
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
				var modelId = request.params[Model.modelName + "_id"];
				Model.findById(modelId, function(error, model) {
					if (error)
					{
						respondError(response, 500, "failed to find " + Model.modelName + " with id: " + modelId);
					}
					else
					{
						if (!model)
						{
							respondError(response, 404, "failed to find " + Model.modelName + " with id: " + modelId);
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
									// not permitted to update a string in an array (eg a ref)
									if (object_heirarchy === heirarchy.LEAF && !_.isArray(parent))
									{
										if (!_.isUndefined(request.text))
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
										console.log("update not allowed to: " + request.originalUrl);
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

	var erase = function(Model, request, response, callback)
	{
		var path = request.route.path;
		console.log("delete path: " + path);
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
				var modelId = request.params[Model.modelName + "_id"];
				if (isModelRootResourcePath(Model, path))
				{
					// delete single resource
					Model.findByIdAndRemove(modelId, function(error, model){
						if (error)
						{
							respondError(response, 500, "failed to delete " + Model.modelName + " at id: " + modelId + ", error: " + error.message);
						}
						else
						{
							if (callback)
							{
								callback(request, response, null);
							}
							else
							{
								respondSuccess(response, "deleted " + Model.modelName + " at id: " + modelId);
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
							respondError(response, 500, "failed to find " + Model.modelName + " with id: " + modelId);
						}
						else
						{
							if (!model)
							{
								respondError(response, 500, "failed to find " + Model.modelName + " with id: " + modelId);
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
										if (_.isArray(parent))
										{
											parent.splice(key, 1);
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
		return acre.options.rootPath + "/" + Model.collection.name + "/:" + Model.modelName + "_id"  === path;
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