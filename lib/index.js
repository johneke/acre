(function () {

	ejs = require('ejs');
	inflect = require('i')();
	async = require('async');
	_ = require('lodash');
	when = require('when');
	crypto = require('crypto');
	toRegexp = require('path-to-regexp');

	var MIN_MONGOOSE_VERSION = '3.6.15';

	var mongoose, ObjectId, acreAdminModel;

    var createVerb = 'put';
    var updateVerb = 'post';

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
			if (userCallback.operation === operation && userCallback.mode === mode && userCallback.path.test(path))
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

		var createPrivate = getUserCallback(acre.CREATE, acre.PRIVATE, path);
		var retrievePrivate = getUserCallback(acre.RETRIEVE, acre.PRIVATE, path);
		var updatePrivate = getUserCallback(acre.UPDATE, acre.PRIVATE, path);
		var deletePrivate = getUserCallback(acre.REMOVE, acre.PRIVATE, path);

		console.log("setting up CRUD REST paths for: " + path);

		// Create
		if (overrideCreate)
		{
			console.log(createVerb.toUpperCase() + " is user overriden for path: " + path);
		}
		else
		{
			var middleware = [];
			if (createPrivate)
			{
				middleware.push(forcePrivateAccess);
			}

			if (preCreate)
			{
				middleware.push(preCreate);
			}

			if (middleware.length)
			{
				app[createVerb](path, middleware, function(request, response){
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
			var middleware = [];
			if (retrievePrivate)
			{
				middleware.push(forcePrivateAccess);
			}

			if (preRetrieve)
			{
				middleware.push(preRetrieve);
			}

			if (middleware.length)
			{
				app.get(path, middleware, function(request, response){
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
			var middleware = [];
			if (updatePrivate)
			{
				middleware.push(forcePrivateAccess);
			}

			if (preUpdate)
			{
				middleware.push(preUpdate);
			}

			if (middleware.length)
			{
				app[updateVerb](path, middleware, function(request, response){
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
			var middleware = [];
			if (deletePrivate)
			{
				middleware.push(forcePrivateAccess);
			}

			if (preDelete)
			{
				middleware.push(preDelete);
			}

			if (middleware.length)
			{
				app["delete"](path, middleware, function(request, response){
					remove(Model, request, response, postDelete);
				});
			}
			else
			{
				app["delete"](path, function(request, response){
					remove(Model, request, response, postDelete);
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

	var normalizePath = function(path)
	{
		var _path = path.replace(new RegExp('^' + acre.options.rootPath), '');
		if (_path.charAt(0) !== '/')
		{
			_path = '/' + _path;
		}

		return _path;
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

	var initializeAdminModel = function(app)
	{
		var AcreAdminSchema = new mongoose.Schema({
			username: {
				type: String, 
				required: true, 
				unique: true,
				index: true,
				validate: [/[\s\S]/, 'admin username cannot be empty']
			},
			password: {
				type: String, 
				required: true,
				validate: [/[\s\S]/, 'admin password cannot be empty']
			}
		});

		acreAdminModel = mongoose.model('AcreAdmin', AcreAdminSchema);

		acre.private(acre.CREATE, [
			acre.options.rootPath + '/acreadmins/:id/username',
			acre.options.rootPath + '/acreadmins/:id/password',
			acre.options.rootPath + '/acreadmins/:id',
			acre.options.rootPath + '/acreadmins'
		]);
		acre.private(acre.RETRIEVE, [
			acre.options.rootPath + '/acreadmins/:id/username',
			acre.options.rootPath + '/acreadmins/:id/password',
			acre.options.rootPath + '/acreadmins/:id',
			acre.options.rootPath + '/acreadmins'
		]);
		acre.private(acre.UPDATE, [
			acre.options.rootPath + '/acreadmins/:id/username',
			acre.options.rootPath + '/acreadmins/:id/password',
			acre.options.rootPath + '/acreadmins/:id',
			acre.options.rootPath + '/acreadmins'
		]);
		acre.private(acre.REMOVE, [
			acre.options.rootPath + '/acreadmins/:id/username',
			acre.options.rootPath + '/acreadmins/:id/password',
			acre.options.rootPath + '/acreadmins/:id',
			acre.options.rootPath + '/acreadmins'
		]);
		acre.pre(acre.CREATE, acre.options.rootPath + '/acreadmins', function(request, response, next){
			if (request.body && request.body.password)
			{
				request.body.password = crypto.createHmac('sha256', acre.options.adminPasswordSalt).update(request.body.password).digest('hex');
			}
			next();
		});

		app.post(acre.options.rootPath + '/acreadmins/login', function(request, response){
			adminLogin(request)
				.then(function(){
					respondSuccess(response, 'login successful');
				}, function(err){
					console.log('login err: ');
					console.log(err);
					respondError(response, 401, 'Unauthorized');
				});
		});

		app.post(acre.options.rootPath + '/acreadmins/logout', function(request, response){
			adminLogout(request);
			respondSuccess(response, 'logout successful');
		});

		app.get(acre.options.rootPath + '/acreadmins/test', forcePrivateAccess, function(request, response){
			respondSuccess(response, '200 OK');
		});
	};

	var adminLogin = function(request)
	{
		var deferred = when.defer();

		if (_.isUndefined(request.session))
		{
			deferred.reject('acre admin portal requires express session middleware');
		}
		else
		{
			adminLogout(request); 
			acreAdminModel.find(function(error, admins){
				if (error)
				{
					deferred.reject(error);
				}
				else
				{
					// if there are no admins, permit anyone to see the admin portal
					// this way admins can be configured
					if (_.isArray(admins))
					{
						var i = 0, found = false;
						for (i in admins)
						{
							if (admins[i].username === request.body.username)
							{
								if (admins[i].password === crypto.createHmac('sha256', acre.options.adminPasswordSalt).update(request.body.password).digest('hex'))
								{
									request.session.acre_admin_id = admins[i]._id.toString();
									found = true;
								}
								break;
							}
						}

						if (found)
						{
							deferred.resolve();
						}
						else
						{
							deferred.reject('login failed');
						}
					}
					else
					{
						deferred.reject('login failed');
					}
				}
			});
		}

		return deferred.promise;
	};

	var adminLogout = function(request)
	{
		if (!_.isUndefined(request.session))
		{
			delete request.session.acre_admin_id;
		}
	};

	var forcePrivateAccess = function(request, response, next)
	{
		if (_.isUndefined(request.session))
		{
			respondError(response, 400, 'acre admin portal requires express session middleware');
		}
		else
		{
			acreAdminModel.find(function(error, admins){
				if (error)
				{
					respondError(response, 500, error.message);
				}
				else
				{
					// if there are no admins, permit anyone to see the admin portal
					// this way admins can be configured
					if (!_.isArray(admins) || admins.length == 0)
					{
						next();
					}
					else
					{
						if (!_.isUndefined(request.session.acre_admin_id))
						{
							var i = 0, found = false;
							for (i in admins)
							{
								if (admins[i]._id.toString() === request.session.acre_admin_id)
								{
									found = true;
									break;
								}
							}

							if (found)
							{
								next();
							}
							else
							{
								respondError(response, 401, 'Unauthorized');
							}
						}
						else
						{
							respondError(response, 401, 'Unauthorized');
						}
					}
				}
			});
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
			var path = normalizePath(request.route.path);
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
										case '[object Boolean]':
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
								case '[object Boolean]':
								// If this is a legacy object in the database which doesnt have the new property
								// that is being updated, we will get 'Undefined' here. In this case, allow client
								// to update the undefined property
								case '[object Undefined]':
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
		adminPasswordSalt: '87fc9f12e96ad14e1899ff5e429d5b9066cb3aecb80bc62d52967662590dacd7'
    };

	acre.foreignKeys = {};

	acre.CREATE = "acre.CREATE";
	acre.RETRIEVE = "acre.RETRIEVE";
	acre.UPDATE = "acre.UPDATE";
	acre.REMOVE = "acre.REMOVE";

    acre.PRE = "acre.PRE";
    acre.POST = "acre.POST";
    acre.OVERRIDE = "acre.OVERRIDE";
    acre.PRIVATE = "acre.PRIVATE";

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
    	/*
    	 * initialize mongoose
    	 */
    	mongoose = _mongoose;
    	ObjectId = mongoose.Types.ObjectId;

    	if (mongoose.version !== MIN_MONGOOSE_VERSION)
    	{
    		return when.reject('using incompatible mongoose version: ' + mongoose.version + ', acre requires: ' + MIN_MONGOOSE_VERSION);
    	}

    	/*
    	 * initialize acre options
    	 */
		_.merge(this.options, options);

		if (!this.options.putIsCreate)
		{
			createVerb = "post";
			updateVerb = "put";
		}

    	/*
    	 * setup acre admin model
    	 */
    	initializeAdminModel(app);


		var promises = [], models = _.values(mongoose.models);

    	/*
    	 * store foreign keys
    	 */
		storeForeignKeys(models);

    	/*
    	 * setup REST CRUD paths for models
    	 */
		promises.push(serveModels(app, models));

    	/*
    	 * setup admin portal
    	 */
		if (this.options.adminPortal)
		{
			promises.push(bindAdminRoutes(app, models));
		}

		return when.all(promises);
	};

	acre.pre = function(operation, path, callback)
	{
		var _path = toRegexp(path);
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
		var _path = toRegexp(path);
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
			var path = toRegexp(paths[i]);
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

	acre.private = function(operation, paths)
	{
		if (Object.prototype.toString.call(paths) !== '[object Array]')
		{
			paths = [paths];
		}

		for (var i in paths)
		{
			var path = toRegexp(paths[i]);
			if ([acre.CREATE, acre.RETRIEVE, acre.UPDATE, acre.REMOVE].indexOf(operation) !== -1)
			{
				var userCallback = new UserCallback(operation, acre.PRIVATE, path, true);
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
					if (path !== '_id' && path !== '__v')
					{
						// property detected
						setRESTPaths(app, nestedUriPath + "/" + path, Model);

						if (!_.isUndefined(propertyDesc) && !_.isUndefined(propertyDesc.options))
						{
							if (_.isArray(propertyDesc.options.type) && propertyDesc.options.type.length > 0)
							{
								if (!_.isUndefined(propertyDesc.options.type[0].ref))
								{
									// add REST paths for refs
									setRESTPaths(app, nestedUriPath + "/" + path + "/:" + propertyDesc.options.type[0].ref + "_id", Model);
								}
								else
								{
									// add REST paths for array of plain strings (this cld be ObjectIds, or strings)
									setRESTPaths(app, nestedUriPath + "/" + path + "/:" + inflect.singularize(path) + "_id", Model);
								}
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
		app.get(_.clone(routePath), serveRoute());

		return when.resolve();
	};

	var create = function(Model, request, response, callback)
	{
		var path = request.route.path;
		console.log("create path: " + path);

		if (isModelRootPath(Model, path))
		{
			Model.create(request.body, function(error, model){
				if (error)
				{
					respondMongooseError(response, error);
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
					respondMongooseError(response, error);
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
											respondMongooseError(response, error);
										}
										else
										{
											if (callback)
											{
												callback(request, response, model);
											}
											else
											{
												respondSuccess(response, "create done");
											}
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
	};

	var retrieve = function(Model, request, response, callback)
	{
		var path = request.route.path;
		console.log("retrieve path: " + path);
		var handleFind, hndl = null;
	
		if (isModelRootPath(Model, path))
		{
			handleFind = function(error, models)
			{
				if (error)
				{
					respondMongooseError(response, error);
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

			try
			{
				if (request.query.q)
				{
					var query = new Buffer(request.query.q, 'base64').toString('ascii');
					query = JSON.parse(query);
					console.log('query: ');
					console.log(query);
					hndl = Model.find(query);
				}
				else
				{
					hndl = Model.find();
				}

				if (request.query.l)
				{
					var limit = parseInt(request.query.l);
					console.log('limit: ' + limit);
					hndl.limit(limit);
				}

				if (request.query.srt)
				{
					var sort = request.query.srt;
					console.log('sort: ' + sort);
					hndl.sort(sort);
				}
			} 
			catch(e)
			{
				hndl = null;
				respondError(response, 400, 'Bad Request');
			}
		}
		else
		{
			var modelId = request.params[Model.modelName + "_id"];

			handleFind = function(error, model)
			{
				if (error)
				{
					console.log("failed to find model with id: " + modelId);
					respondMongooseError(response, error);
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
								if (callback)
								{
									callback(request, response, object);
								}
								else
								{
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
							}
						});
					}
				}
			};

			var hndl = Model.findById(modelId);
		}

		var refs = [];
		var populatedModels = [];
		var addNestedRefs = function(prefix, foreignKeys)
		{
			var i, key, keys;
			if (_.isPlainObject(foreignKeys))
			{
				keys = _.keys(foreignKeys)
				for (i in keys)
				{
					key = keys[i];
					refs.push({
						path: prefix ? prefix + '.' + key : key,
						model: foreignKeys[key]
					});
				}

				var nested = [];
				for (i in foreignKeys)
				{
					key = i;
					var nestedModelName = foreignKeys[i];

					// Block out cyclic refs for now
					if (populatedModels.indexOf(nestedModelName) === -1 && _.keys(acre.foreignKeys).indexOf(nestedModelName) !== -1)
					{
						nested.push({
							pfx: key,
							model: nestedModelName
						});
					}
				}
				
				if (nested.length > 0)
				{
					for(i in nested)
					{
						populatedModels.push(nested[i].model);
						addNestedRefs(nested[i].pfx, acre.foreignKeys[nested[i].model]);
						populatedModels.pop();
					}
				}
			}
		};

		populatedModels.push(Model.modelName);
		addNestedRefs(null, acre.foreignKeys[Model.modelName]);
		populatedModels.pop();

		if (hndl)
		{
			hndl.exec(function(err, data){
				if (err)
				{
					handleFind(err, data);
				}
				else
				{
					var finalData = data;
					async.eachSeries(
						refs,
						function(ref, done){
							mongoose.models[ref.model].populate(data, ref.path, function(err, data){
								finalData = data;
								done(err);
							});
						},
						function(err){
							handleFind(err, finalData);
						}
					);
				}
			});
		}
	};

	var update = function(Model, request, response, callback)
	{
		var path = request.route.path;
		console.log("update path: " + path);

		if (isModelRootPath(Model, path))
		{
			respondError(response, 405, "not allowed to " + updateVerb + " to " + Model.collection.name + ", must only update leaf elements");
		}
		else
		{
			var modelId = request.params[Model.modelName + "_id"];
			Model.findById(modelId, function(error, model) {
				if (error)
				{
					respondMongooseError(response, error);
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
								if (object_heirarchy === heirarchy.LEAF && !_.isArray(parent))
								{
									if (!_.isUndefined(request.text))
									{
										parent[key] = request.text;
										model.save(function(error, model){
											if (error)
											{
												console.log("error occured updating object at path: " + request.originalUrl + " error: " + error.message);
												respondMongooseError(response, error);
											}
											else
											{
												console.log("update done");
												if (callback)
												{
													callback(request, response, model);
												}
												else
												{
													respondSuccess(response, "update sucessful");
												}
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
									// not permitted to update a string in an array (eg a ref)
									console.log("update not allowed to: " + request.originalUrl);
									respondError(response, 405, "update not allowed to: " + request.originalUrl);
								}
							}
						});
					}
				}
			});
		}
	};

	var remove = function(Model, request, response, callback)
	{
		var path = request.route.path;
		console.log("delete path: " + path);

		if (isModelRootPath(Model, path))
		{
			// delete all resources
			Model.remove(function(error, models){
				if (error)
				{
					respondMongooseError(response, error);
				}
				else
				{
					if (callback)
					{
						callback(request, response, models);
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
						console.log('failed to delete: ' + Model.modelName + ' with id: ' + modelId + ', error: ');
						console.log(error);
						respondMongooseError(response, error);
					}
					else
					{
						if (callback)
						{
							callback(request, response, model);
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
						respondMongooseError(response, error);
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
									if (_.isArray(parent))
									{
										parent.splice(key, 1);
										model.save(function(error, model){
											if (error)
											{
												console.log("failed to delete array item, error: " + error.message);
												respondMongooseError(response, error);
											}
											else
											{
												console.log("delete done");
												if (callback)
												{
													callback(request, response, model);
												}
												else
												{
													respondSuccess(response, "delete done");
												}
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

	var respondMongooseError = function(response, err)
	{
		var regexps = [
			/validation failed/gi,
			/duplicate key error/gi
		];
		var code = 500;

		for (i in regexps)
		{
			if (regexps[i].test(err.message))
			{
				code = 400;
				break;
			}
		}

		response.send(code, err);
	};

	var respondError = function(response, code, err)
	{
		response.send(code, err);
	};

    module.exports = acre;
}());