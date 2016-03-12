function do_api(url, data) {
    console.log('API REQUEST ' + url);
    $.get(url, data);
}

function do_command(item, command, val) {
    var data = {};

    if (val != undefined) {
	  data["val"] = val;
    }
    do_api("/api/item/" + item + "/command/" + command, data);
}

function do_scene(scene, action) {
    do_api("/api/scene/" + scene + "/command/" + (action?action:""));
}

function do_disable(item, disable) {
  if(disable) {
    do_api("/api/item/" + item + "/disable");
  } else {
    do_api("/api/item/" + item + "/enable");
  }
}

var app = angular.module("idiotic", []);
app.service("api", ["$http", "Item", function($http, Item) {
    var api = this;
    api.api_url = '/api/';

    api.items = [];

    api.get = function(endpoint) {
        return $http.get(encodeURI(api.api_url + endpoint)).then(function(resp) {
            if(resp.data.status == "success") {
                console.log('GET /api/' + endpoint + ' successful');
                return resp.data.result;
            } else {
                console.log('GET /api/' + endpoint + ' FAILED ' + resp.data.result);
                throw resp.data.result;
            }
        });
    };

    var refresh = function() {
        api.get('items').then(function(items_json) {
            api.items = [];
            angular.forEach(items_json, function(item_json) {
                api.items.push(Item(item_json));
            });
        });
    };

    refresh();
}]);

app.factory("Item", ["$http", function($http) {
    function Item(itemData) {
        var item = new Object();
        angular.extend(item, itemData);

        return item;
    };

    return Item;
}]);

app.controller("idioticController", ["$scope", "api", function($scope, api) {
    var idiotic = this;
    idiotic.api = api;

    idiotic.items = function() { return api.items; };
}]);

$(function() {
    $("#toc").pushpin({top: $("#page-top").offset().top });
    $(".scrollspy").scrollSpy();

    $(".command").each(function() {
	var elm = $(this);
	elm.on(elm.data("event"), function() {
	    if (elm.data("use-val")) {
		do_command(elm.data("item"), elm.data("command"), elm.val());
	    } else {
		do_command(elm.data("item"), elm.data("command"));
	    }
	});
    });

    $(".scene-control").each(function() {
	    var elm = $(this);
	    elm.click(function(evt) {
            if(elm.data("action") == "enter") {
	            do_scene(elm.data("scene"), "enter");
                elm.data("action", "exit");
            } else {
                do_scene(elm.data("scene"), "exit");
                elm.data("action", "enter");
            }
	    });
    });

    $(".disable").each(function() {
      var elm = $(this);
      elm.click(function(evt) {
        do_disable(elm.data("item"), elm.prop("checked"));
      });
    });

    $("form").submit(function(){return false;});
});
