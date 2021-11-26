const SVGNS = "http://www.w3.org/2000/svg";  // SVG namespace
const NOTE_ONSET_TOLERANCE = 0.25;  // Fuzziness in matching onset times of notes, in seconds

// Penalties when aligning played MIDI to reference
const DELETION_PENALTY = 10;  // Note in reference but not played
const INSERTION_PENALTY = 10;  // Note not in reference but played
const SUBSTITUTION_PENALTY = 10;  // Note in reference and played differ
const NEARBY_PITCH_PENALTY = 1;  // Played a (temporally) nearby note to reference note

// MIDI message types
const MIDI_NOTE_OFF = 128;
const MIDI_NOTE_ON = 144;
const MIDI_ACTIVE_SENSING = 254;

function Page(div, canvas, rect) {
  this.div = div;  // Containing div for every page
  this.canvas = canvas;  // Canvas that contains pdf
  this.rect = rect;  // rect that shows highlights
}

function PdfManager(container, pdf_url) {
  /* class that manages rendering pdf and drawing on the pdf */
  this.container = container;
  this.pdf_url = pdf_url;
  this.RESOLUTION_MULTIPLIER = 2.0;  // Increase resolution by this factor
  this.bar_height = 0.2;  // Height of a bar in fraction of page
  this.pages = [];  // Array containing Page objects
}

PdfManager.prototype.init = function() {
  var obj = this;

  // Loaded via <script> tag, create shortcut to access PDF.js exports.
  var pdfjsLib = window['pdfjs-dist/build/pdf'];

  // The workerSrc property shall be specified.
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

  // Using DocumentInitParameters object to load binary data.
  var loadingTask = pdfjsLib.getDocument(this.pdf_url);
  return loadingTask.promise.then(function(pdf) {
    console.log('PDF loaded');
    
    for (let num = 1; num <= pdf.numPages; num++) {
      // Set up canvas and parent div
      let page_div = document.createElement('div');
      page_div.classList.add('page-div');
      let canvas = document.createElement('canvas');
      canvas.classList.add('page-canvas');
      page_div.appendChild(canvas);
      obj.container.appendChild(page_div);

      // Set up svg and store page_obj
      let svg = document.createElementNS(SVGNS, 'svg');
      svg.classList.add('page-svg');
      let rect = document.createElementNS(SVGNS, 'rect');
      rect.setAttributeNS(null, 'x', 0);
      rect.setAttributeNS(null, 'y', 0);
      rect.setAttributeNS(null, 'fill', 'blue');
      rect.setAttributeNS(null, 'opacity', '0.0');
      svg.appendChild(rect);
      page_div.appendChild(svg);
      let page_obj = new Page(page_div, canvas, rect);
      obj.pages.push(page_obj);

      pdf.getPage(num).then(function(page) {
        console.log('Page loaded');
        
        var viewport = page.getViewport({scale: 1});
        var scale = obj.container.offsetWidth / viewport.width;
        console.log(scale)
        var viewport = page.getViewport({scale: scale});

        // Prepare canvas using PDF page dimensions
        var context = canvas.getContext('2d');
        canvas.height = viewport.height * obj.RESOLUTION_MULTIPLIER;
        canvas.width = viewport.width * obj.RESOLUTION_MULTIPLIER;
        canvas.style.height = viewport.height + 'px';
        canvas.style.width = viewport.width + 'px';
        var transform = [obj.RESOLUTION_MULTIPLIER, 0, 0, obj.RESOLUTION_MULTIPLIER, 0, 0];

        // Set up svg to match canvas
        svg.setAttributeNS(null, 'width', canvas.offsetWidth);
        svg.setAttributeNS(null, 'height', canvas.offsetHeight);
        rect.setAttributeNS(null, 'width', canvas.offsetWidth);
        rect.setAttributeNS(null, 'height', obj.bar_height * canvas.offsetHeight);

        // Render PDF page into canvas context
        var renderContext = {
          canvasContext: context,
          viewport: viewport,
          transform: transform
        };
        var renderTask = page.render(renderContext);
        renderTask.promise.then(function () {
          console.log('Page rendered');
        });
      });
    }
  }, function (reason) {
    // PDF loading error
    console.error(reason);
  });
}

PdfManager.prototype.show_rect = function(page_obj, y) {
  page_obj.rect.setAttributeNS(null, 'y', page_obj.div.offsetHeight * (y - this.bar_height / 2));
  page_obj.rect.setAttributeNS(null, 'opacity', '0.2');
}

PdfManager.prototype.hide_rect = function(page_obj) {
  page_obj.rect.setAttributeNS(null, 'opacity', '0.0');
}

PdfManager.prototype.set_focus = function(page_num, y) {
  for (var i = 0; i < this.pages.length; i++) {
    if (i == page_num) {
      this.show_rect(this.pages[i], y);
      this.pages[i].rect.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    } else {
      this.hide_rect(this.pages[i]);
    }
  }
}

function ScoreTimesManager(midi_player, pdf_manager, form_element) {
  /* Class that handles aligning lines in score with times in reference MIDI */
  this.midi_player = midi_player;
  this.pdf_manager = pdf_manager;
  this.form_element = form_element;
  this.score_times = [];  // List of objects aligning score positions to times in reference MIDI
  this.cur_page = 0;  // Current page being focused on
  this.cur_y = 0;  // Current y position within page, as fraction of page height
}

ScoreTimesManager.prototype.init = function() {
  var obj = this;
  this.pdf_manager.init().then(function() {
    for (let i = 0; i < obj.pdf_manager.pages.length; i++) {
      let page_obj = obj.pdf_manager.pages[i];
      console.log(page_obj);

      // Move the highlight rectangle to follow the mouse
      page_obj.div.onmousemove = function(e) {
        var y = (e.pageY - this.offsetTop) / this.offsetHeight;
        obj.pdf_manager.show_rect(page_obj, y);
        obj.cur_page = i;
        obj.cur_y = y;
      };

      // Hide the highlight rectangle
      page_obj.div.onmouseout = function() {
        obj.pdf_manager.hide_rect(page_obj);
      };

      // Start playing and record alignment
      page_obj.div.onclick = function() {
        if (! obj.midi_player.playing) {
          obj.midi_player.start();
        }
        var cur_position = {
          time: obj.midi_player.currentTime,
          page: obj.cur_page,
          y: obj.cur_y,
        };
        obj.score_times.push(cur_position);
        obj.form_element.value = JSON.stringify(obj.score_times);
        console.log(obj.form_element.value);
      }
    }
  });
}

function SyncManager(pdf_manager, midi_url, score_times) {
  /* Class that handles synchronizing score with MIDI input */
  this.pdf_manager = pdf_manager;
  this.midi_url = midi_url;
  this.score_times = score_times;
  this.reference_notes = [];
  this.dp_state = null;  // Total penalty for aligning current note to i-th note in reference
}

SyncManager.prototype.init = function() {
  var obj = this;

  this.pdf_manager.init().then(function() {
    // Read MIDI reference file
    core.urlToNoteSequence(obj.midi_url).then(function(note_sequence) {
      for (var i = 0; i < note_sequence.notes.length; i++) {
        var full_note = note_sequence.notes[i];
        var note = {
          start: full_note.startTime,
          pitch: full_note.pitch,
          nearby_pitches: new Set(),
        }
        note.nearby_pitches.add(note.pitch);
        obj.reference_notes.push(note);
      }
      obj.reference_notes.sort(function(a, b) { return a.start - b.start})  // Sort just in case it's not sorted

      // Compute nearby pitches for each note (pitches whose onset is almost at same time)
      for (var i = 0; i < obj.reference_notes.length; i++) {
        var note = obj.reference_notes[i];

        // Go forward in notes while within NOTE_ONSET_TOLERANCE
        var j_plus = i+1;
        while (j_plus < obj.reference_notes.length) {
          next_note = obj.reference_notes[j_plus];
          if (next_note.start - note.start > NOTE_ONSET_TOLERANCE) {
            break;
          }
          note.nearby_pitches.add(next_note.pitch);
          j_plus++;
        }

        // Go backwards in notes while within NOTE_ONSET_TOLERANCE
        var j_minus = i-1;
        while (j_minus >= 0) {
          prev_note = obj.reference_notes[j_minus];
          if (note.start - prev_note.start > NOTE_ONSET_TOLERANCE) {
            break;
          }
          note.nearby_pitches.add(prev_note.pitch);
          j_minus--;
        }
      }



    });
    
    // Set up MIDI navigator to take MIDI input
    navigator.requestMIDIAccess().then(
      function(access){
        midi = access;
        var inputs = midi.inputs;
        var iteratorInputs = inputs.values();
        var input = iteratorInputs.next().value;
        input.onmidimessage = function(event) { obj.on_midi_message(event); }
      }, 
      function(error){
        console.log('MIDI Error, Error code: ' + err.code);
      });
  });
}

SyncManager.prototype.on_midi_message = function(event) {
  // Only look at note on events
  if (event.data[0] != MIDI_NOTE_ON) {
    return;
  }

  // Update the sequence alignment DP state
  var pitch = event.data[1];
  var new_dp_state = [];
  for (var i = 0; i < this.reference_notes.length; i++) {
    var ref = this.reference_notes[i]
    var align_penalty = SUBSTITUTION_PENALTY;
    if (pitch == ref.pitch) {
      align_penalty = 0;
    } else if (ref.nearby_pitches.has(pitch)) {
      align_penalty = NEARBY_PITCH_PENALTY;
    }
    var score;
    if (this.dp_state == null) {
      score = i * DELETION_PENALTY + align_penalty;
    } else if (i == 0) {
      score = this.dp_state[0] + INSERTION_PENALTY;
    } else {
      var sub_score = this.dp_state[i-1] + align_penalty;
      var ins_score = this.dp_state[i] + INSERTION_PENALTY;
      var del_score = new_dp_state[i-1] + DELETION_PENALTY;
      score = Math.min(sub_score, ins_score, del_score);
    }
    new_dp_state.push(score)
  }
  this.dp_state = new_dp_state;

  // Get the best guess of current note in reference
  var best_score = this.dp_state[0];
  var best_index = 0;
  for (var i = 1; i < this.reference_notes.length; i++) {
    if (this.dp_state[i] < best_score) {
      best_index = i;
      best_score = this.dp_state[i];
    }
  }
  var est_time = this.reference_notes[best_index].start;
  console.log({
    best_score: best_score, 
    best_index: best_index, 
    time: est_time,
  });

  // Binary search to find corresponding location in the PDF
  var pos_index;
  if (this.score_times[0].time > est_time) {
    pos_index = 0;
  } else if (this.score_times[this.score_times.length - 1].time < est_time) {
    pos_index = this.score_times.length - 1;
  } else {
    var lo = 0;  // Always <= est_time
    var hi = this.score_times.length - 1; // Always > est_time
    while (hi - lo > 1) {
      var mid = Math.floor((lo + hi) / 2);
      if (this.score_times[mid].time > est_time) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    pos_index = lo;
  }
  console.log(this.score_times);
  var est_position = this.score_times[pos_index];
  console.log(est_position);

  // Update the UI
  this.pdf_manager.set_focus(est_position.page, est_position.y);
}
