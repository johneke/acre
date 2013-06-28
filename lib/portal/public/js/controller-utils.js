function getNestedResource(path, resource, Restangular)
{
	function _getNestedResource(fields, _resource, restangularResource)
	{
		console.log('fields left:');
		console.log(fields);

		var field = fields.shift(), i, item;
		if (_resource[field])
		{
			if (fields.length > 0 && Object.prototype.toString.call(_resource[field]) === '[object Array]')
			{
				var id = fields.shift();
				if (fields.length === 0)
				{
					console.log('.one({field},{id})'.replace(/{field}/, field).replace(/{id}/, id));
					return restangularResource.one(field, id);
				}
				else
				{
					for (i in _resource[field])
					{
						item = _resource[field][i];
						if (item._id === id)
						{
							console.log('.one({field},{id})'.replace(/{field}/, field).replace(/{id}/, id));
							return _getNestedResource(fields, item, restangularResource.one(field, id));
						}
					}

					console.log('failed to find array item with id: ' + id);
				}
			}
			else if (fields.length === 0)
			{
				if (Object.prototype.toString.call(_resource[field]) === '[object Array]')
				{
					console.log('.all({field})'.replace(/{field}/, field));
					return restangularResource.all(field);
				}
				else
				{
					console.log('.one({field})'.replace(/{field}/, field));
					return restangularResource.one(field);
				}
			}
			else
			{
				console.log('.one({field})'.replace(/{field}/, 'field'));
				return _getNestedResource(fields, item, restangularResource.one(field));
			}
		}
		else
		{
			console.log('failed to find field: ' + field);
		}
	}

	var fields = path.split('/');
	fields.shift();
	var field = fields.shift(), id = fields.shift();
	console.log('Resangular.one({field},{id})'.replace(/{field}/, field).replace(/{id}/, id));
	return _getNestedResource(fields, resource, Restangular.one(field, id));
}