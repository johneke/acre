function getNestedResource(path, resource, Restangular)
{
	function _getNestedResource(fields, _resource, restangularResource)
	{
		var field = fields.shift(), i, item;
		if (_resource[field])
		{
			if (fields.length > 0 && Object.prototype.toString.call(_resource[field]) === '[object Array]')
			{
				var id = fields.shift();
				if (fields.length === 0)
				{
					return restangularResource.one(field, id);
				}
				else
				{
					for (i in _resource[field])
					{
						item = _resource[field][i];
						if (item._id === id)
						{
							return _getNestedResource(fields, item, restangularResource.one(field, id));
						}
					}

					throw 'failed to find array item with id: ' + id;
				}
			}
			else if (fields.length === 0)
			{
				if (Object.prototype.toString.call(_resource[field]) === '[object Array]')
				{
					return restangularResource.all(field);
				}
				else
				{
					return restangularResource.all(field);
				}
			}
			else
			{
				return _getNestedResource(fields, _resource[field], restangularResource.all(field));
			}
		}
		else
		{
			throw 'failed to find field: ' + field;
		}
	}

	var fields = path.split('/');
	fields.shift();
	var field = fields.shift(), id = fields.shift();
	return _getNestedResource(fields, resource, Restangular.one(field, id));
}
