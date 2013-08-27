(function(){

angular.module('objectView', [])
	.directive('objectViewGenerate', function($compile){
		var linker = function(scope, element, attrs) {

			function extractLabel(obj)
			{
				var labelFields = ['name', 'title', 'label'];
				for (var i in labelFields)
				{
					var field = labelFields[i];
					if (_.has(obj, field))
					{
						return obj[field];
					}
				};

				return '';
			}

			function getTemplate(field, model, isArrayItem, arrayModel, instance, path)
			{
				var content = '', i, j, _path;
				if (_.isPlainObject(field))
				{
					content += '<div class="acre-ov-container">';
					if (isArrayItem)
					{
						content += '<span class="acre-ov-container-title">{legend}<button class="btn btn-small btn-danger acre-array-action-button" data-ng-click="pop(\'{path}\')">Remove</button></span><br />'.replace(/{model}/gi, arrayModel);
					}
					else
					{
						content += '<span class="acre-ov-container-title">{legend}</span><br />';
					}
					content = content
								.replace(/{legend}/gi, inflect.humanize(model.split('.').pop()))
								.replace(/{path}/gi, path + '/{{{model}._id}}')
								.replace(/{model}/gi, model);

					for (i in field)
					{
						//skip private vars 
						if (i === '_id' || i === '__v')
						{
							continue;
						}

						if (isArrayItem)
						{
							_path = path + '/{{{model}._id}}/' + i;
							_path = _path.replace(/{model}/gi, model);
						}
						else
						{
							_path = path + '/' + i;
						}

						if (_.isPlainObject(field[i]) && (_.isUndefined(instance[i].type) || instance[i].type !== 'select'))
						{
							content += getTemplate(field[i], model + '.' + i, false, null, instance[i], _path);
						}
						else if (_.isArray(field[i]) && instance[i].length > 0 && (_.isUndefined(instance[i][0].type) || instance[i][0].type !== 'select'))
						{
							if (_.isString(instance[i][0]))
							{
								// list of foreign keys
								var title = inflect.singularize(inflect.decapitalize(i));

								content += '<div class="acre-ov-container">';
								content += '<span class="acre-ov-container-title">{legend}<button class="btn btn-small btn-info acre-array-action-button" data-ng-click=\'pushText("{path}", "{title}")\'>Add</button></span><br />';
								content += '<div class="acre-ov-container">';
								for (j in field[i])
								{
									content += '<span class="acre-ov-value">{label}</span><button class="btn btn-small btn-danger acre-array-action-button" data-ng-click=\'pop("{uri}")\'>Remove</button><br />';
									content = content
													.replace(/{label}/gi, field[i][j])
													.replace(/{uri}/gi, _path + '/' + field[i][j]);
								}
								content += '</div>';
								content += '</div>';

								content = content
											.replace(/{legend}/gi, inflect.humanize(i))
											.replace(/{title}/gi, title)
											.replace(/{path}/gi, _path);
							}
							else
							{
								content += '<div class="acre-ov-container">';
								content += '<span class="acre-ov-container-title">{legend}<button class="btn btn-small btn-info acre-array-action-button" data-ng-click="push(\'{path}\', {obj}, \'{name}\')">Add</button></span><br />'
												.replace(/{legend}/gi, inflect.humanize(i))
												.replace(/{path}/gi, _path)
												.replace(/{name}/gi, i)
												.replace(/{obj}/gi, JSON.stringify(instance[i][0]).replace(/\"/gi, "'"));
								content += getTemplate(field[i], model + '.' + i, false, null, instance[i], _path) + '</div>';
							}
						}
						else
						{
							if (_.isPlainObject(instance[i]) && instance[i].type === 'select')
							{
								// dont bother showing ref if the ref has been deleted on the db
								if (field[i])
								{
									//foreign key
									content += '<span class="acre-ov-label">{title}</span>:<span class="acre-ov-value">{label}</span><button class="btn btn-small acre-array-action-button" data-ng-click=\'select("{path}", "{title}", "{value}", {options})\'>Edit</button><br />';

									var title = inflect.humanize(i);
									var options = {};
									options[i] = instance[i];
									content = content
													.replace(/{model}/gi, model + '.' + i)
													.replace(/{title}/gi, title)
													.replace(/{value}/gi, field[i]._id)
													.replace(/{label}/gi, extractLabel(field[i]))
													.replace(/{options}/gi, JSON.stringify(options))
													.replace(/{path}/gi, _path);
								}
							}
							else if (_.isArray(instance[i]) && instance[i].length > 0 && instance[i][0].type === 'select')
							{
								// list of foreign keys
								var title = inflect.singularize(inflect.decapitalize(i));
								var options = {};
								options[title] = instance[i][0];

								content += '<div class="acre-ov-container">';
								content += '<span class="acre-ov-container-title">{legend}<button class="btn btn-small btn-info acre-array-action-button" data-ng-click=\'pushSelect("{path}", "{title}", {options})\'>Add</button></span><br />';
								content += '<div class="acre-ov-container">';
								for (j in field[i])
								{
									if (field[i][j])
									{
										content += '<span class="acre-ov-value">{label}</span><button class="btn btn-small btn-danger acre-array-action-button" data-ng-click=\'pop("{uri}")\'>Remove</button><br />';
										content = content
														.replace(/{label}/gi, extractLabel(field[i][j]))
														.replace(/{uri}/gi, _path + '/' + field[i][j]._id);
									}
								}
								content += '</div>';
								content += '</div>';

								content = content
											.replace(/{legend}/gi, inflect.humanize(i))
											.replace(/{title}/gi, title)
											.replace(/{path}/gi, _path)
											.replace(/{options}/gi, JSON.stringify(options));

							}
							else
							{
								content += '<span class="acre-ov-label">{title}</span>:<span class="acre-ov-value">{{{model}}}</span><button class="btn btn-small acre-array-action-button" data-ng-click="set(\'{path}\', \'{title}\', {model})">Edit</button><br />';
								
								var title = inflect.humanize(i);
								content = content
												.replace(/{model}/gi, model + '.' + i)
												.replace(/{title}/gi, title)
												.replace(/{path}/gi, _path);
							}

						}
					}
					content += '</div>';
				}
				else if (_.isArray(field))
				{
					var item = inflect.singularize(model.split('.').pop());

					content += '<div ng-repeat="{item} in {model}">'.replace(/{item}/gi, item).replace(/{model}/gi, model);
					content += getTemplate(field[0], item, true, model, instance[0], path);
					content += '</div>';
				}

				return content;
			}

			var template = '<div>' + getTemplate(scope.ovData, scope.ovModelName, false, null, scope.ovDataInstance, '/'+scope.ovCollectionName+'/'+scope.ovData._id) + '</div>';
			var ovContainerClass = attrs.ovContainerClass ? 'class="'+attrs.ovContainerClass+'"' : '',
				ovContainerTitleClass = attrs.ovContainerTitleClass ? 'class="'+attrs.ovContainerTitleClass+'"' : '',
				ovLabelClass = attrs.ovLabelClass ? 'class="'+attrs.ovLabelClass+'"' : '',
				ovValueClass = attrs.ovValueClass ? 'class="'+attrs.ovValueClass+'"' : '';

			template = template
							.replace(/{container-class}/gi, ovContainerClass)
							.replace(/{container-title-class}/gi, ovContainerTitleClass)
							.replace(/{label-class}/gi, ovLabelClass)
							.replace(/{value-class}/gi, ovValueClass);

			element.html(template);
			$compile(element.contents())(scope);
		};

		return {
			restrict: 'E',
			replace: true,
			link: linker
		};
	});
})();