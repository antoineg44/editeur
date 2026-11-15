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


// -------------------------------------------------- // PROGRAMMATION DE LA LECTURE // --------------------------------------------------
      function scheduleMusic() {

    transport.cancel();

    const tempo = Number(
        document.getElementById("tempo").value
    ) || 100;

    transport.bpm.value = tempo;

    eventIds = [];

    const grouped = new Map();

    events.forEach(event => {

        const key = event.time.toFixed(5);

        if (!grouped.has(key)) {
            grouped.set(key, []);
        }

        grouped.get(key).push(event);

    });

    for (const [key, group] of grouped) {

        const time = Number(key);

        const notes = group.map(e => e.pitch);

        const duration = Math.max(
            ...group.map(e => e.duration)
        );

        const ticks = Math.round(time * transport.PPQ);

        const eventId = transport.schedule((audioTime) => {

            synth.triggerAttackRelease(
                notes,
                Math.max(0.05, duration * 60 / tempo),
                audioTime
            );

            osmd.cursor.next();

            document.getElementById("timeInfo").textContent =
                "Mesure : " + group[0].measure;

        }, ticks + "i");

        eventIds.push(eventId);

    }

}