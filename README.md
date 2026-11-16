# editeur

Un clic sur une syllabe de la partition affiche dans la console son texte,
son numéro de couplet et l'entrée de paroles OSMD issue du MusicXML.

Un double-clic permet de modifier une syllabe directement sur la partition.
Pour commencer sur une note sans parole, cliquez sur « Ajouter des paroles »,
puis sur la note. Par défaut, la première ligne est utilisée s'il n'y a pas
encore de paroles dans la même partie, voix et portée ; sinon, c'est la deuxième.
Le sélecteur permet aussi de choisir explicitement la première ou la deuxième
ligne, y compris pour compléter une ligne existante. Si la note possède déjà une
parole sur la ligne choisie, elle est ouverte pour modification. Cliquez à nouveau
sur le bouton pour quitter ce mode. Pour un accord, cliquez sur la tête de la
note ; la parole d'une ligne est partagée par les notes de l'accord.
Validez avec Entrée ou ✓, ou annulez avec Échap ou ×. La lecture est arrêtée
à la validation. Utilisez « Télécharger le MusicXML » pour enregistrer la
partition modifiée ; le fichier d'origine n'est pas écrasé.
Si une syllabe contient plusieurs éléments de texte, ils sont modifiés séparément.

Pendant l'édition, Espace passe à la note suivante sans relier les syllabes ;
le tiret les relie et passe à la note suivante. La navigation suit la même
partie, voix, portée et le même couplet, en ignorant les silences et les notes
supplémentaires des accords. Une parole est créée si nécessaire : Échap
l'annule, et Espace sur une parole encore vide passe à la note suivante.
Les modifications des paroles précédentes restent enregistrées dans la partition
en cours ; le téléchargement reste nécessaire pour les conserver dans un fichier.

Un double-clic sur un accord au-dessus de la portée permet de le modifier.
Pour en ajouter un, cliquez sur « Ajouter des accords », puis sur une note.
Espace valide et passe à la note suivante, même si elle n'a pas encore d'accord ;
le tiret fait partie du texte. Entrée valide et Échap annule l'édition en cours.
La navigation reste dans la même partie et sur la même portée, en ignorant les
silences et les notes simultanées.
Comme pour les paroles, téléchargez le MusicXML pour conserver les modifications.

Les accords structurés MusicXML et les indications textuelles au-dessus de la
portée sont modifiables. Les nouveaux accords créés avec le bouton sont des
indications textuelles ; lors de la navigation depuis un accord structuré,
les nouveaux accords restent structurés. Pour ces derniers, la saisie accepte
les notes françaises ou anglaises, les altérations simples, les qualités usuelles,
une basse et une altération de degré (par exemple `Ré#m7`, `Dm/F`, `C7(b9)`).
Une notation structurée non reconnue est refusée sans modifier le fichier.
Les textes libres qui ne ressemblent pas à un accord ne sont pas sélectionnés
automatiquement par la navigation ; ils restent accessibles par double-clic.

Les tests s'exécutent dans un navigateur :
[`tests/lyrics.html`](tests/lyrics.html) et [`tests/accords.html`](tests/accords.html).
