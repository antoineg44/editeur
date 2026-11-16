// osmd est ton instance OpenSheetMusicDisplay

function findNoteBySvgId(svgId) {

    const measures = osmd.graphic.measureList;

    for (const measure of measures) {
        for (const staff of measure) {
            for (const staffEntry of staff.staffEntries) {
                for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
                    for (const graphicalNote of voiceEntry.notes) {

                        const svgElement = graphicalNote.getSVGGElement();

                        if (svgElement && svgElement.id === svgId) {
                            return graphicalNote.sourceNote;
                        }

                    }
                }
            }
        }
    }

    return null;
}

function findXmlNote(musicXml, note) {

    if (!note) return null;

    return note.SourceXmlElement || null;
}


function init() {

    document.querySelectorAll('#score [id^="vf-auto"]').forEach(element => {

    element.addEventListener("click", function(e) {

        const note = findNoteBySvgId(this.id);

        if (!note) return;

        const xmlNote = findXmlNote(musicxml, note);

        console.log("Note OSMD :", note);
        console.log("Note MusicXML :", xmlNote);
        console.log(xmlNote.outerHTML);

    });

});
}