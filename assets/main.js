var app = angular.module("idiotic", []);

function compareNames(a, b) {
    var name_a = a.name.toUpperCase();
    var name_b = b.name.toUpperCase();

    if (name_a < name_b) {
        return -1;
    } else if (name_a > name_b) {
        return 1;
    }

    return 0;
}

app.factory("Api", ["$interval", "$http", "Item", "Scene",
        function($interval, $http, Item, Scene) {
    function Api(api_root, refresh_callback, refresh_interval) {
        var api = new Object();
        api.api_url = api_root + 'api/';
        api.refresh_interval = refresh_interval !== undefined ? refresh_interval : 15000;
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

            if (api.refresher === undefined) {
                // Refresh regularly hereafter, until stopped.
                api.refresher = $interval(api.refresh, api.refresh_interval);
            }

            // TODO: Parallelize
            return api.get('items').then(function(items_json) {
                        api.items = [];
                        items_json.sort(compareNames);
                        angular.forEach(items_json, function(item_json) {
                            api.items.push(Item(api, item_json));
                        });
                    }).then(function() {
                        return api.get('scenes').then(function(scenes_json) {
                            scenes_json.sort(compareNames);
                            api.scenes = [];
                            angular.forEach(scenes_json, function(scene_json) {
                                api.scenes.push(Scene(api, scene_json));
                            });
                        })
                    }).then(function() {
                        return api.get('version').then(function(version) {
                            api.version = version.VERSION;
                        });
                    }).then(api.refresh_callback);
        };

        api.cancel_refresh = function() {
            console.log('Cancelling scheduled API refreshes');
            $interval.cancel(api.refresher);
            api.refresher = undefined;
        };

        api.refresh();
        return api;
    };
    return Api;
}]);

app.factory("Item", ["$http", function($http) {
    function Item(api, itemData) {
        var item = new Object();
        item.api = api;

        item.refresh = function(data) {
            item.type = data.type;
            item.id = data.id;
            item.name = data.name;
            item.state = data.state;
            item.tags = data.tags;
            item.enabled = data.enabled;

            // If the state is a string, try to translate it to a boolean.
            if (typeof(data.state) == "string") {
                if (["on", "set"].indexOf(data.state.toLowerCase) >= 0) {
                    item.state = true;
                } else if (["off"].indexOf(data.state.toLowerCase) >= 0) {
                    item.state = false;
                }
            }

            // Construct commands from dictionary returned by API
            item.buttons = [];
            item.commands = [];
            item.default_commands = [];
            for (name in data.commands) {
                command = data.commands[name];
                command['name'] = name;
                if (command.arguments.length > 0) {
                    item.commands.push(command);
                } else {
                    item.buttons.push(command);
                }

                if (command.default) {
                    item.default_commands.push(command);
                }
            }
        };

        item.is_active = function() {
            return (typeof(item.state) == "boolean") && item.state;
        }

        item.default_action = function() {
            var send_functions = [];
            for (var index in item.default_commands) {
                var command = item.default_commands[index];
                send_functions.push(item.send_command(command));
            }
            return Promise.all(send_functions);

        };

        // Return a list of up to the first three buttons. If there are more
        // than 3, it returns only the first two.
        item.front_buttons = function() {
            if(item.buttons.length > 3) {
                return item.buttons.slice(0, 2);
            } else {
                return item.buttons;
            }
        }

        // Return a list of all buttons except the first two or three. It is
        // guaranteed that
        //   item.front_buttons() + item.back_buttons() = item.buttons
        item.back_buttons = function() {
            if(item.buttons.length <= 3) {
                return [];
            } else {
                console.log(item.buttons, item.buttons.slice(2));
                return item.buttons.slice(2);
            }
        }

        item.send_state = function() {
            if(item.state === undefined) {
                console.log("Item", item.id, "refusing to send undefined state");
                return;
            }
            return item.send_command("set?val=" + item.state);
        }

        item.send_command = function(command) {
            return api.get("item/" + item.id + "/command/" + command.name)
                .then(function(result) {
                    // Update our models.
                    item.refresh(result.item);
                });
        }

        item.enable_graph = function() {
            return item.tags.indexOf("webui.show_sparkline") >= 0;
        }

        item.readonly = function() {
            return item.tags.indexOf("webui.readonly") >= 0;
        }

        item.show_actions = function() {
            return (!item.readonly()) && item.buttons.length > 0;
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

        item.refresh(itemData);
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

        scene.is_active = function() {
            return scene.state;
        }

        scene.send_activity = function() {
            var enterexit = scene.state ? "enter" : "exit";
            return api.get("scene/" + scene.id + "/command/" + enterexit);
        };

        scene.toggle_activity = function() {
            scene.state = !scene.state;
        };

        scene.default_action = function() {
            scene.toggle_activity();
            scene.send_activity();
        };

        return scene;
    };

    return Scene;
}]);

app.controller("idioticController", ["$scope", "$http", "Api", "visibilityService",
        function($scope, $http, Api, visibilityService) {
    var idiotic = this;

    // Give empty array until API is loaded.
    idiotic.items = function() { return []; }
    idiotic.scenes = function() { return []; }
    idiotic.conf = new Object();

    idiotic.refresh = function() {
        // Run all refresh functions, and broadcast when complete.
        Promise.all([
                idiotic.refresh_version(),
                idiotic.refresh_sections()
        ]).then(function() {
                $scope.$broadcast('idioticLoaded');
            });
    }
    idiotic.refresh_version = function() {
        console.log('loaded', idiotic.api.version);
        idiotic.conf.version = idiotic.api.version;
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

    $http.get("/webui/conf.json").then(function(resp) {
        console.log('WebUI configuration loaded');
        idiotic.conf = resp.data.result;

        idiotic.api = Api(idiotic.conf.api_base, idiotic.refresh);
        idiotic.items = function() { return idiotic.api.items; };
        idiotic.scenes = function() { return idiotic.api.scenes; };
    });

    $scope.slug = function(s) {
        return s.toLowerCase().replace(/ /g, '_');
    };

    $scope.$on("visibilityChanged", function(event, hidden) {
        if (hidden) {
            idiotic.api.cancel_refresh();
        } else {
            idiotic.api.refresh();
        }
    });
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

app.directive('dropdown', ['$timeout', function($timeout) {
    return {
        link: function($scope, element, attrs) {
            $timeout(function() {
                $(element).dropdown();
            }, 0);
        }
    };
}]);

app.service('visibilityService', ["$rootScope", "$document",
        function ($rootScope, $document) {
    function visibilitychanged() {
        $rootScope.$broadcast('visibilityChanged',
                $document[0].hidden ||
                $document[0].webkitHidden ||
                $document[0].mozHidden ||
                $document[0].msHidden);
    }

    $document[0].addEventListener("visibilitychange",       visibilitychanged);
    $document[0].addEventListener("webkitvisibilitychange", visibilitychanged);
    $document[0].addEventListener("msvisibilitychange",     visibilitychanged);
}]);
