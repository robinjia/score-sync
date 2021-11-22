#!/usr/bin/env python3
"""Espeon: Synchronize sheet music with MIDI."""
import argparse
import flask
from flask import Flask, request, session
from flask_sqlalchemy import SQLAlchemy
import re
import sys
import urllib

import util

app = Flask(__name__, root_path=util.ROOT_DIR)
#config = util.load_config()
#app.config['SECRET_KEY'] = config['secret_key']
#app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///{}'.format(config['db_file'])
#app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
#db = SQLAlchemy(app)

@app.route('/', methods=['get'])
def home():
    return flask.render_template('index.html')

@app.route('/piece', methods=['get'])
def piece():
    return flask.render_template('piece.html')


if __name__ == '__main__':
    parser = argparse.ArgumentParser('Launch Espeon server.')
    parser.add_argument('--hostname', '-n', default='0.0.0.0')
    parser.add_argument('--port', '-p', type=int, default=8196)
    parser.add_argument('--debug', '-d', action='store_true')
    args = parser.parse_args()
    if args.debug:
        app.config['TEMPLATES_AUTO_RELOAD'] = True
    app.run(args.hostname, args.port, args.debug)
