var app = angular.module("idiotic", []);
app.factory("Api", ["$http", "Item", "Scene", function($http, Item, Scene) {
    function Api(api_root, refresh_callback) {
        var api = new Object();
        api.api_url = api_root + 'api/';
        if(refresh_callback) {
            api.refresh_callback = refresh_callback;
        } else {
            api.refresh_callback = function() {};
        }

        api.items = [];

        api.get = function(endpoint) {
            return $http.get(encodeURI(api.api_url + endpoint)).then(function(resp) {
                if(resp.data.status == "success") {
                    console.log('GET', api.api_url + endpoint + ' successful');
                    return resp.data.result;
                } else {
                    console.log('GET', api.api_url + endpoint + ' FAILED')
                    throw resp.data;
                }
            });
        };
        api.post = function(endpoint, data) {
            return $http.post(encodeURI(api.api_url + endpoint), data).then(function(resp) {
                if(resp.data.status == "success") {
                    console.log('POST', api.api_url + endpoint + ' successful');
                    return resp.data.result;
                } else {
                    console.log('POST', api.api_url + endpoint + ' FAILED')
                    throw resp.data;
                }
            });
        };

        api.refresh = function() {
            console.log('Refreshing API from', api.api_url);
            // TODO: Parallelize
            return api.get('items').then(function(items_json) {
                        api.items = [];
                        angular.forEach(items_json, function(item_json) {
                            api.items.push(Item(api, item_json));
                        });
                    }).then(function() {
                    api.get('scenes').then(function(scenes_json) {
                        api.scenes = [];
                        angular.forEach(scenes_json, function(scene_json) {
                            api.scenes.push(Scene(api, scene_json));
                        });
                    })
            }).then(api.refresh_callback);
        };

        api.refresh();
        return api;
    };
    return Api;
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
            return api.get("item/" + item.id + "/command/" + command)
                .then(function(result) {
                    // Update our models.
                    angular.extend(item, result.item);
                });
        }

        item.enable_graph = function() {
            return item.tags.indexOf("webui.show_sparkline") >= 0;
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

app.factory("Scene", ["$http", function($http) {
    function Scene(api, sceneData) {
        var scene = new Object();
        angular.extend(scene, sceneData);
        scene.api = api;

        scene.id = scene.name.toLowerCase().replace(/ /g, '_');
        scene.state = scene.active;

        scene.send_activity = function() {
            var enterexit = scene.state ? "enter" : "exit";
            return api.get("scene/" + scene.id + "/command/" + enterexit);
        };

        return scene;
    };

    return Scene;
}]);

app.controller("idioticController", ["$scope", "$http", "Api", function($scope, $http, Api) {
    var idiotic = this;

    // Give empty array until API is loaded.
    idiotic.items = function() { return []; }
    idiotic.scenes = function() { return []; }
    idiotic.conf = new Object();

    idiotic.refresh = function() {
        // Run all refresh functions, and broadcast when complete.
        Promise.all([
                idiotic.refresh_sections()
        ]).then(function() {
                $scope.$broadcast('idioticLoaded');
            });
    }
    idiotic.refresh_sections = function () {
        var sections = [];
        for (section_index in idiotic.conf.sections) {
            var section = idiotic.conf.sections[section_index];
            // Prepare a new section object with an items() method.
            var s = new Object();
            s.include_tags = [];
            s.exclude_tags = [];
            angular.extend(s, section);

            // TODO: this is a hack and awful
            if (section.include_tags.indexOf("_scene") >= 0) {
                s.items = idiotic.scenes;
                sections.push(s);
                continue;
            }

            s.items = function() {
                var items = [];
                for (item_index in idiotic.items()) {
                    var item = idiotic.items()[item_index];
                    // For each item, check its tags against our lists. Include
                    // it only if there is at least one tag matching
                    // include_tags, and exactly zero tags matching
                    // exclude_tags.
                    var include = false;
                    for(tag_index in item.tags) {
                        var tag = item.tags[tag_index];
                        // If the tag is excluded, reject immediately.
                        if(this.exclude_tags.indexOf(tag) >= 0) {
                            include = false;
                            break;
                        }
                        // If the tag is included, mark for inclusion and
                        // continue to look for excluded tags.
                        if(this.include_tags.indexOf(tag) >= 0) {
                            include = true;
                        }
                    }
                    if(include) {
                        items.push(item);
                    }
                }
                return items;
            }

            sections.push(s);
        }

        idiotic.sections = sections;
    }

    $http.get("/webui_conf.json").then(function(resp) {
        console.log('WebUI configuration loaded');
        idiotic.conf = resp.data;

        idiotic.api = Api(idiotic.conf.api_base, idiotic.refresh);
        idiotic.items = function() { return idiotic.api.items; };
        idiotic.scenes = function() { return idiotic.api.scenes; };
    });

    $scope.slug = function(s) {
        return s.toLowerCase().replace(/ /g, '_');
    };
}]);

app.directive('scrollspy', ['$timeout', function($timeout) {
    return {
        link: function($scope, element, attrs) {
            $timeout(function() {
                $(element).scrollSpy();
            }, 0);
        }
    };
}]);
