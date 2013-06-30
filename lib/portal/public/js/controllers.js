function dialogController($scope, dialog)
{
  $scope.close = function(data){
    dialog.close(data);
  };
}

function alertController($scope)
{
  $scope.alerts = [];

  $scope.close = function(index) {
    $scope.alerts.splice(index, 1);
  };

  $scope.$on('post-alert', function(event, type, msg){
	 $scope.alerts.push({type: type, msg: msg});
  });
}