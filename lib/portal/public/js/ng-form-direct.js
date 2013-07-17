(function(){

angular.module('formDirect', [])
	.directive('formDirectGenerate', function($compile){
		function extractLabel (obj)
		{
			return 'label';
		}

		var linker = function(scope, element, attrs) {

			function getTemplate(field, model, isArrayItem, arrayModel)
			{
				var content = '', i, j, k;

				if (_.isPlainObject(field))
				{
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
						if (_.isPlainObject(field[i]) && (_.isUndefined(field[i].type) || field[i].type !== 'select'))
						{
							content += getTemplate(field[i], model + '.' + i, false, null);
						}
						else if (_.isArray(field[i]) && field[i].length > 0 && (_.isUndefined(field[i][0].type) || field[i][0].type !== 'select'))
						{
							content += '<fieldset {group-class}>';
							content += '<legend {group-title-class}>{legend}<button {add-btn-class} data-ng-click="{id}.push({obj})">Add</button></legend>'
											.replace(/{legend}/gi, inflect.humanize(i))
											.replace(/{id}/gi, model + '.' + i)
											.replace(/{obj}/gi, JSON.stringify(field[i][0]).replace(/\"/gi, "'"));
							content += getTemplate(field[i], model + '.' + i, false, null) + '</fieldset>';
						}
						else
						{
							if (field[i] === 'boolean')
							{
								content += '{label}<input {checkbox-input-class} id="{id}" data-ng-model="{model}" type="checkbox"><br />';
							}
							else if (field[i] === 'area')
							{
								content += '{label}<textarea {textarea-class} id="{id}" data-ng-model="{model}" {placeholder}></textarea><br />';
							}
							else if (_.isPlainObject(field[i]) && field[i].type === 'select')
							{
								var item = inflect.singularize(i);
								var temp = '<select data-ng-init=\'{item}_options = {options};\' data-ng-options="option._id as option._id for option in {item}_options" {select-input-class} id="{id}{{$index}}" data-ng-model="{model}"><option value="">Select {item}...</option></select><br />'
									.replace(/{options}/gi, JSON.stringify(field[i].options))
									.replace(/{item}/gi, item);
								content += temp;
								console.log(temp);
							}
							else if (_.isArray(field[i]) && field[i].length > 0 && field[i][0].type === 'select')
							{
								var item = inflect.singularize(i);
								content += '<button data-ng-init=\'{item}_options = {options};\' {add-btn-class} data-ng-click="{model}.push(\'\')">Add {item}</button><br />';
								content += '<span data-ng-repeat="{item} in {model} track by $id($index)">';
								content += '<select data-ng-options="option._id as option._id for option in {item}_options" {select-input-class} id="{id}{{$index}}" data-ng-model="{model}"><option value="">Select {item}...</option></select>';
								content += '<button {remove-btn-class} data-ng-click="{model}.splice($index, 1)">Remove</button><br />';
								content += '</span>';
								content = content
												.replace(/{options}/gi, JSON.stringify(field[i][0].options))
												.replace(/{item}/gi, item);
							}
							else
							{
								content += '{label}<input id="{id}" data-ng-model="{model}" type="text" {placeholder}><br />';
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
						}
					}
					content += '</fieldset>';
				}
				else if (_.isArray(field))
				{
					var item = inflect.singularize(model.split('.').pop());

					content += '<div ng-repeat="{item} in {model}">'.replace(/{item}/gi, item).replace(/{model}/gi, model);
					content += getTemplate(field[0], item, true, model);
					content += '</div>';
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
				fdrSelectInputClass = attrs.fdrSelectInputClass ? 'class="'+attrs.fdrSelectInputClass+'"' : '',
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
							.replace(/{select-input-class}/gi, fdrSelectInputClass)
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