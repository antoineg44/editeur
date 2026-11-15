// -------------------------------------------------- // INITIALISATION AUDIO // --------------------------------------------------
async function initAudio() {
  await Tone.start();
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.5, release: 0.2 },
    }).toDestination();
  }
  synth.volume.value = Tone.gainToDb(
    Math.max(0.001, Number(document.getElementById("volume").value) / 100),
  );
}

function buildPlaybackTimeline() {
  const timeline = [];

  const iterator = osmd.cursor.Iterator.clone();

  let safety = 0;

  while (!iterator.EndReached && safety < 100000) {
    const time = iterator.currentTimeStamp.realValue * 4;

    console.log(
      "Position OSMD :",
      time,
      "Mesure :",
      iterator.CurrentMeasure.MeasureNumber,
      "Notes :",
      iterator.CurrentVoiceEntries.length,
    );

    const notes = [];

    const voices = iterator.CurrentVoiceEntries;

    for (const voice of voices) {
      for (const note of voice.Notes) {
        if (!note || note.isRest()) continue;

        notes.push({
          midi: note.halfTone + 12,
          pitch: Tone.Frequency(note.halfTone + 12, "midi").toNote(),
          duration: note.Length.RealValue * 4,
        });
      }
    }

    // Ne conserver que les positions musicales distinctes
    const previous = timeline[timeline.length - 1];

    if (previous && Math.abs(previous.time - time) < 0.000001) {
      previous.notes.push(...notes);
    } else {
      timeline.push({
        time: time,
        notes: notes,
        measure: iterator.CurrentMeasure.MeasureNumber,
      });
    }

    iterator.moveToNext();

    safety++;
  }

  return timeline;
}

// -------------------------------------------------- // PROGRAMMATION DE LA LECTURE // --------------------------------------------------
function scheduleMusic() {
  transport.cancel();

  const tempo = Number(document.getElementById("tempo").value) || 100;

  transport.bpm.value = tempo;

  eventIds = [];

  const timeline = events;

  timeline.forEach((position, index) => {
    const seconds = (position.time * 60) / tempo;

    const id = transport.schedule((audioTime) => {
      // Déplacer le curseur à partir de la deuxième position
      if (index > 0) {
        osmd.cursor.next();
      }

      // Jouer les notes de cette position
      if (position.notes.length > 0) {
        const pitches = position.notes.map((note) => note.pitch);

        const duration = Math.max(
          ...position.notes.map((note) => note.duration),
        );

        synth.triggerAttackRelease(
          pitches,
          Math.max(0.05, (duration * 60) / tempo),
          audioTime,
        );
      }

      document.getElementById("timeInfo").textContent =
        "Mesure : " + position.measure;
    }, seconds);

    eventIds.push(id);
  });
}

// -------------------------------------------------- // COMMANDES DU LECTEUR // --------------------------------------------------
document.getElementById("play").addEventListener("click", async () => {
  if (!loaded || !events.length) {
    alert("Chargez d'abord un fichier MusicXML.");
    return;
  }

  await initAudio();

  if (transport.state === "paused") {
    transport.start();
    playing = true;
    return;
  }

  if (!playing) {
    osmd.cursor.reset();

    scheduleMusic();

    playing = true;

    transport.start();
  }
});

document.getElementById("pause").addEventListener("click", () => {
  transport.pause();
  playing = false;
});
function stopPlayback() {
  transport.stop();
  transport.cancel();
  playing = false;
  eventIds = [];
  if (synth) {
    synth.releaseAll();
  }
  if (loaded) {
    osmd.cursor.reset();
  }
  document.getElementById("timeInfo").textContent = "Mesure : 1";
}
document.getElementById("stop").addEventListener("click", stopPlayback);

// -------------------------------------------------- // REGLAGE DU VOLUME // --------------------------------------------------
document.getElementById("volume").addEventListener("input", function () {
  if (synth) {
    synth.volume.value = Tone.gainToDb(
      Math.max(0.001, Number(this.value) / 100),
    );
  }
});
