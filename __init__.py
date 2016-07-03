"""webui -- mostly-automatically generate a simple web interface.

"""

import jinja2
import json
import logging
import datetime
import scipy.stats
from flask import Response, request
from idiotic import utils

from .version import VERSION

MODULE_NAME = "webui"

LOG = logging.getLogger("module.webui")

USE_GRAPHS = False

try:
    import pygal
    USE_GRAPHS = True
except:
    LOG.warning("Could not import pygal; graphs are disabled")

SECT_INCLUDE = ("include_tags",
                "exclude_tags",
                "include_items",
                "exclude_items")

include_tags = set()
exclude_tags = set()
default_graph = False
asset_path = None

env = None

template_args = {}

def configure(config, api, assets):
    global include_tags, exclude_tags, asset_path, env, template_args
    global default_graph

    template_args["title"] = config.get("page_title", "idiotic")
    template_args["root"] = api.path

    default_graph = config.get("enable_graph", False)

    asset_path = assets
    env = jinja2.Environment(loader=jinja2.FileSystemLoader(asset_path))

    api.add_url_rule('/', '_main_page', _main_page)
    api.add_url_rule('/main.js', '_main_js', _main_js)
    api.add_url_rule('/main.css', '_main_css', _main_css)
    api.add_url_rule('/webui/version', 'webui_version', _webui_version)
    api.add_url_rule('/webui/conf.json', '_webui_conf', _webui_conf(config))
    api.add_url_rule('/sparkline/<item>.svg', '_sparkline', _sparkline)
    api.add_url_rule('/graph/<item>.svg', '_graph', _graph)

    return

def _main_page(*_, **__):
    args = dict(template_args)
    return Response(env.get_template('main.html').render(**args), mimetype='text/html')

def _main_js(*_, **__):
    return Response(env.get_template('main.js').render(), mimetype='text/javascript')

def _main_css(*_, **__):
    return Response(env.get_template('main.css').render(), mimetype='text/css')

@utils.jsonified
def _webui_version():
    return VERSION

def _webui_conf(config):
    config['webui_version'] = VERSION
    @utils.jsonified
    def __webui_conf():
        return config
    return __webui_conf

def __empty_svg():
    return """<?xml version="1.0" encoding="UTF-8" standalone="no"?> <svg
xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 1 1"
width="1" height="1" id="svg_pixel"> </svg>"""

def _sparkline(item, *args, **kwargs):
    if USE_GRAPHS:
        history = items[item].state_history
        if not history:
            return __empty_svg()

        _, values = zip(*history.last(min(10, len(history))))

        graph = pygal.Line(interpolate='cubic', style=pygal.style.LightStyle)
        graph.add("Last 10", values)
        return Response(graph.render_sparkline(height=25).decode('UTF-8'), mimetype='image/svg+xml')
    else:
        return Response(__empty_svg(), mimetype='image/svg+xml')

def __avg_time(datetimes):
    total = sum(dt.hour * 3600 + dt.minute * 60 + dt.second for dt in datetimes)
    avg = total / len(datetimes)
    minutes, seconds = divmod(int(avg), 60)
    hours, minutes = divmod(minutes, 60)
    return datetime.datetime.combine(datetime.date(1900, 1, 1), datetime.time(hours, minutes, seconds))

def __group(times, values, count=50, group=lambda v: sum(v)/len(v)):
    if len(times) != len(values):
        raise ValueError("times and values must have same length")

    values = [float(x) for x in values]

    if len(times) < count or len(times) < 2:
        return times, values

    count = min(count, len(times))
    timestamps = [x.timestamp() for x in times]

    res, divisions, bins = scipy.stats.binned_statistic(timestamps, values, statistic='mean', bins=count)

    return [datetime.datetime.fromtimestamp(x) for x in divisions[1:]], res

def _graph(item, *_, **kwargs):
    args = utils.single_args(request.args)

    time = args.get('time', 86400)
    offset = args.get('offset', 0)
    count = args.get('count', None)

    if USE_GRAPHS:
        history = items[item].state_history
        if not history:
            return Response(__empty_svg(), mimetype='image/svg+xml')

        if count:
            times, values = zip(*history.last(min(10, len(history))))
        else:
            times, values = zip(*history.since(datetime.datetime.now() - datetime.timedelta(seconds=int(time))))

        times, values = __group(times, values)

        graph = pygal.Line(style=pygal.style.LightStyle, x_label_rotation=-60)
        graph.title = items[item].name
        graph.add("Value", values)
        graph.x_labels = (t.strftime("%H:%M:%S") for t in times)
        return Response(graph.render().decode('UTF-8'), mimetype='image/svg+xml')
    else:
        return Response(__empty_svg(), mimetype='image/svg+xml')

def _include_item(item, include_tags, exclude_tags, include_items, exclude_items):
    return ((not include_tags or set(item.tags) & include_tags) or
            (item.name in include_items or
             utils.mangle_name(item.name) in include_items)) and \
            (not exclude_tags or not set(item.tags) & exclude_tags) and \
            (not exclude_items or (item.name not in exclude_items and
                                   utils.mangle_name(item.name) not in exclude_items))
