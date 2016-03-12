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
    api.post = function(endpoint, data) {
        return $http.post(encodeURI(api.api_url + endpoint), data).then(function(resp) {
            if(resp.data.status == "success") {
                console.log('POST /api/' + endpoint + ' successful');
                return resp.data.result;
            } else {
                console.log('POST /api/' + endpoint + ' FAILED ' + resp.data.result);
                throw resp.data.result;
            }
        });
    };

    var refresh = function() {
        api.get('items').then(function(items_json) {
            api.items = [];
            angular.forEach(items_json, function(item_json) {
                api.items.push(Item(api, item_json));
            });
        });
    };

    refresh();
}]);

app.factory("Item", ["$http", function($http) {
    function Item(api, itemData) {
        var item = new Object();
        angular.extend(item, itemData);
        item.api = api;

        item.send_state = function() {
            if(item.state === undefined) {
                console.log("Item", item.id, "refusing to send undefined state");
                return;
            }
            return item.send_command("set?val=" + item.state);
        }

        item.send_command = function(command) {
            return api.get("item/" + item.id + "/command/" + command);
        }

        item.enable_graph = function() {
            return item.tags.indexOf("webui.enable_graph") >= 0;
        }

        item.disabled = function(disabled) {
            if(disabled === undefined) {
                return !item.enabled;
            } else {
                item.enabled = !disabled;
            }
        };
        item.show_disable = function() {
            return item.tags.indexOf("webui.show_disable") >= 0;
        }
        item.send_disable = function() {
          if(item.enabled) {
            return api.get("item/" + item.id + "/enable");
          } else {
            return api.get("item/" + item.id + "/disable");
          }
        }

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

    $("form").submit(function(){return false;});
});
