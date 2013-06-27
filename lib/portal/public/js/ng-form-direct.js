(function(){

angular.module('formDirect', [])
	.directive('formDirectGenerate', function($compile){
		var linker = function(scope, element, attrs) {

			function getTemplate(field, model, isArrayItem, arrayModel)
			{
				var content = '', i, j;

				switch(Object.prototype.toString.call(field))
				{
					case '[object Object]':
						content += '<fieldset {group-class}>';
						if (isArrayItem)
						{
							content += '<legend {group-title-class}>{legend}<button {remove-btn-class} data-ng-click="{model}.splice($index, 1)" data-ng-disabled="{model}.length < 2">Remove</button></legend>'.replace(/{model}/gi, arrayModel);
						}
						else
						{
							content += '<legend {group-title-class}>{legend}</legend>';
						}
						content = content.replace(/{legend}/gi, inflect.humanize(model.split('.').pop()));
						for (i in field)
						{
							switch(Object.prototype.toString.call(field[i]))
							{
								case '[object Object]':
									content += getTemplate(field[i], model + '.' + i, false, null);
									break;

								case '[object Array]':
									content += '<fieldset {group-class}>';
									content += '<legend {group-title-class}>{legend}<button {add-btn-class} data-ng-click="{id}.push({obj})">Add</button></legend>'
													.replace(/{legend}/gi, inflect.humanize(i))
													.replace(/{id}/gi, model + '.' + i)
													.replace(/{obj}/gi, JSON.stringify(field[i][0]).replace(/\"/gi, "'"));
									content += getTemplate(field[i], model + '.' + i, false, null) + '</fieldset>';
									break;

								default:

									if (typeof field[i] !== 'string')
									{
										content += '{label}<input id="{id}" data-ng-model="{model}" type="text" {placeholder}><br />';
									}
									else
									{
										switch(field[i].toLowerCase())
										{
											case 'boolean':
												content += '{label}<input {checkbox-input-class} id="{id}" data-ng-model="{model}" type="checkbox"><br />';
												break;

											case 'area':
												content += '{label}<textarea {textarea-class} id="{id}" data-ng-model="{model}" {placeholder}></textarea><br />';
												break;

											default:
												content += '{label}<input {text-input-class} id="{id}" data-ng-model="{model}" type="text" {placeholder}><br />';
												break;
										}
									}

									var title = inflect.humanize(i),
									label = attrs.hasOwnProperty('fdrShowLabel') ? '<label {label-class} for="{id}">{title}</label>' : '',
									placeholder = attrs.hasOwnProperty('fdrShowPlaceholder') ? 'placeholder="{title}"' : '';

									content = content
													.replace(/{model}/gi, model + '.' + i)
													.replace(/{placeholder}/gi, placeholder)
													.replace(/{label}/gi, label)
													.replace(/{title}/gi, title)
													.replace(/{id}/gi, model + '.' + i);
									break;
							}
						}
						content += '</fieldset>';
						break;

					case '[object Array]':
						var item = inflect.singularize(model.split('.').pop());

						content += '<div ng-repeat="{item} in {model}">'.replace(/{item}/gi, item).replace(/{model}/gi, model);
						content += getTemplate(field[0], item, true, model);
						content += '</div>';
						break;

					default:
						break;
				}

				return content;
			}

			var template = '<form {form-class}>' + getTemplate(JSON.parse(attrs.fdrModel), attrs.fdrModelName, false, null) + '</form>';
			var fdrFormClass = attrs.fdrFormClass ? 'class="'+attrs.fdrFormClass+'"' : '',
				fdrGroupClass = attrs.fdrGroupClass ? 'class="'+attrs.fdrGroupClass+'"' : '',
				fdrGroupTitleClass = attrs.fdrGroupTitleClass ? 'class="'+attrs.fdrGroupTitleClass+'"' : '',
				fdrLabelClass = attrs.fdrLabelClass ? 'class="'+attrs.fdrLabelClass+'"' : '',
				fdrAddBtnClass = attrs.fdrAddBtnClass ? 'class="'+attrs.fdrAddBtnClass+'"' : '',
				fdrRemoveBtnClass = attrs.fdrRemoveBtnClass ? 'class="'+attrs.fdrRemoveBtnClass+'"' : '',
				fdrTextInputClass = attrs.fdrTextInputClass ? 'class="'+attrs.fdrTextInputClass+'"' : '',
				fdrCheckboxInputClass = attrs.fdrCheckboxInputClass ? 'class="'+attrs.fdrCheckboxInputClass+'"' : '',
				fdrTextareaClass = attrs.fdrTextareaClass ? 'class="'+attrs.fdrTextareaClass+'"' : '';

			template = template
							.replace(/{form-class}/gi, fdrFormClass)
							.replace(/{group-class}/gi, fdrGroupClass)
							.replace(/{group-title-class}/gi, fdrGroupTitleClass)
							.replace(/{label-class}/gi, fdrLabelClass)
							.replace(/{add-btn-class}/gi, fdrAddBtnClass)
							.replace(/{remove-btn-class}/gi, fdrRemoveBtnClass)
							.replace(/{text-input-class}/gi, fdrTextInputClass)
							.replace(/{checkbox-input-class}/gi, fdrCheckboxInputClass)
							.replace(/{textarea-class}/gi, fdrTextareaClass);

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