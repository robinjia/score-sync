#!/usr/bin/env python3
"""Synchronize sheet music with MIDI."""
import argparse
from datetime import datetime
import flask
from flask import Flask, request, session
from flask_sqlalchemy import SQLAlchemy
import io
import json
from pdf2image import convert_from_bytes
import re
import sys
import urllib

import util

app = Flask(__name__, root_path=util.ROOT_DIR)
config = util.load_config()
app.config['SECRET_KEY'] = config['secret_key']
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///{}'.format(config['db_file'])
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

class Piece(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(1024))
    composer = db.Column(db.String(128))
    pdf_url = db.Column(db.String(1024))
    pdf = db.Column(db.LargeBinary())
    midi_url = db.Column(db.String(1024))
    midi = db.Column(db.LargeBinary())
    score_times_json = db.Column(db.String(1024))
    date_added = db.Column(db.DateTime, nullable=False, default=datetime.now)
    page_images = db.relationship('PageImage', backref='piece', lazy=True)

class PageImage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    piece_id = db.Column(db.Integer, db.ForeignKey('piece.id'), nullable=False)
    page_number = db.Column(db.Integer, nullable=False)
    width = db.Column(db.Integer, nullable=False)
    height = db.Column(db.Integer, nullable=False)
    png = db.Column(db.LargeBinary())

@app.route('/', methods=['get'])
def home():
    return flask.render_template('index.html')

@app.route('/add_piece', methods=['post'])
def post_add_piece():
    name = flask.request.form['name']
    composer = flask.request.form['composer']
    pdf_url = flask.request.form['pdf_url']

    # Create Piece
    with urllib.request.urlopen(pdf_url) as f:
        pdf = f.read()
    midi_url = flask.request.form['midi_url']
    with urllib.request.urlopen(midi_url) as f:
        midi = f.read()
    piece = Piece(name=name, composer=composer, pdf_url=pdf_url, pdf=pdf,
                  midi_url=midi_url, midi=midi)
    db.session.add(piece)
    db.session.commit()

    # Create PageImage's for the piece
    images = convert_from_bytes(pdf, dpi=100)  # dpi=100 to be safe regarding iOS limitations
    for page_num, image in enumerate(images):
        byte_array = io.BytesIO()
        image.save(byte_array, format='png')
        page_image = PageImage(piece_id=piece.id, page_number=page_num, 
                               width=image.width, height=image.height,
                               png=byte_array.getvalue())
        db.session.add(page_image)
    db.session.commit()
    return flask.redirect(f'/align/{piece.id}')

@app.route('/pdf/<piece_id>.pdf', methods=['get'])
def get_pdf(piece_id):
    piece = Piece.query.get(piece_id)
    response = flask.make_response(piece.pdf)
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = 'inline'
    return response

@app.route('/images/<piece_id>_<page_num>.png', methods=['get'])
def get_png(piece_id, page_num):
    piece = Piece.query.get(piece_id)
    page_num = int(page_num)
    page_images = [x for x in piece.page_images if x.page_number == page_num]
    if not page_images:
        flask.abort(404)
    page_image = page_images[0]
    response = flask.make_response(page_image.png)
    response.headers['Content-Type'] = 'image/png'
    response.headers['Content-Disposition'] = 'inline'
    return response

@app.route('/midi/<piece_id>.mid', methods=['get'])
def get_midi(piece_id):
    piece = Piece.query.get(piece_id)
    response = flask.make_response(piece.midi)
    response.headers['Content-Type'] = 'audio/midi'
    response.headers['Content-Disposition'] = 'attachment'
    return response

@app.route('/align/<piece_id>', methods=['get'])
def align(piece_id):
    piece = Piece.query.get(piece_id)
    return flask.render_template('align.html', piece=piece)

@app.route('/post_align', methods=['post'])
def post_align():
    piece_id = flask.request.form['piece_id']
    score_times_str = flask.request.form['score_times']
    piece = Piece.query.get(piece_id)
    piece.score_times_json = score_times_str
    db.session.commit()
    return flask.redirect(f'/play/{piece.id}')

@app.route('/play/<piece_id>', methods=['get'])
def play(piece_id):
    piece = Piece.query.get(piece_id)
    print(piece.score_times_json)
    score_times = json.loads(piece.score_times_json)
    return flask.render_template('play.html', piece=piece, score_times=score_times)

if __name__ == '__main__':
    parser = argparse.ArgumentParser('Launch server.')
    parser.add_argument('--hostname', '-n', default='0.0.0.0')
    parser.add_argument('--port', '-p', type=int, default=8196)
    parser.add_argument('--debug', '-d', action='store_true')
    args = parser.parse_args()
    if args.debug:
        app.config['TEMPLATES_AUTO_RELOAD'] = True
    app.run(args.hostname, args.port, args.debug)
