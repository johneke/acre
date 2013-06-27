(function(){

angular.module('objectView', [])
	.directive('objectViewGenerate', function($compile){
		var linker = function(scope, element, attrs) {

			function getTemplate(field, model, isArrayItem, arrayModel, instance, path)
			{
				var content = '', i, j, _path;

				switch(Object.prototype.toString.call(field))
				{
					case '[object Object]':
						content += '<div class="acre-ov-container">';
						if (isArrayItem)
						{
							content += '<span class="acre-ov-container-title">{legend}<button class="btn btn-small btn-danger acre-array-action-button" data-ng-click="" data-ng-disabled="{model}.length < 2">Remove</button></span><br />'.replace(/{model}/gi, arrayModel);
						}
						else
						{
							content += '<span class="acre-ov-container-title">{legend}</span><br />';
						}
						content = content.replace(/{legend}/gi, inflect.humanize(model.split('.').pop()));
						for (i in field)
						{

							if (isArrayItem)
							{
								_path = path + '/{{{model}._id}}/' + i;
								_path = _path.replace(/{model}/gi, model);
							}
							else
							{
								_path = path + '/' + i;
							}

							switch(Object.prototype.toString.call(field[i]))
							{
								case '[object Object]':
									content += getTemplate(field[i], model + '.' + i, false, null, instance[i], _path);
									break;

								case '[object Array]':
									content += '<div class="acre-ov-container">';
									content += '<span class="acre-ov-container-title">{legend}<button class="btn btn-small btn-info acre-array-action-button" data-ng-click="push(\'{path}\', {obj}, \'{name}\')">Add</button></span><br />'
													.replace(/{legend}/gi, inflect.humanize(i))
													.replace(/{path}/gi, path + '/' + i)
													.replace(/{name}/gi, i)
													.replace(/{obj}/gi, JSON.stringify(instance[i][0]).replace(/\"/gi, "'"));
									content += getTemplate(field[i], model + '.' + i, false, null, instance[i], _path) + '</div>';
									break;

								default:
									switch(field[i])
									{
										case 'boolean':
											content += '<span class="acre-ov-label">{title}</span>:<span class="acre-ov-value">{{{model} ? "yes" : "no"}}</span><button class="btn btn-small acre-array-action-button" data-ng-click="">Edit</button><br />';
											break;

										default:
											if (i !== '_id')
											{
												content += '<span class="acre-ov-label">{title}</span>:<span class="acre-ov-value">{{{model}}}</span><button class="btn btn-small acre-array-action-button" data-ng-click="set(\'{path}\', \'{title}\', \'{{{model}}}\')">Edit</button><br />';
											}
											break;
									}

									var title = inflect.humanize(i);
									content = content
													.replace(/{model}/gi, model + '.' + i)
													.replace(/{title}/gi, title)
													.replace(/{path}/gi, _path);
									break;
							}
						}
						content += '</div>';
						break;

					case '[object Array]':
						var item = inflect.singularize(model.split('.').pop());

						content += '<div ng-repeat="{item} in {model}">'.replace(/{item}/gi, item).replace(/{model}/gi, model);
						content += getTemplate(field[0], item, true, model, instance[0], path);
						content += '</div>';
						break;

					default:
						break;
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