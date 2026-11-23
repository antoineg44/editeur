# Brancher les actions de l'interface

[Démarrage et utilisation](../../README.md) ·
[Modifier le HTML](../../interfaces/README.md)

Ces fichiers regroupent les actions, formulaires et choix par fonctionnalité.
Ils sont chargés comme scripts classiques : aucun import JavaScript, build ou
gestionnaire de paquets n'est nécessaire.

## Quel fichier modifier ?

| Fichier | Responsabilité |
| --- | --- |
| [project.js](./project.js) | Accueil, projets, fichiers, dossiers et partage |
| [settings.js](./settings.js) | Réglages, calibration et profils d'instruments |
| [setup.js](./setup.js) | Instruments, scores, accordage et transposition d'instrument |
| [write.js](./write.js) | Palettes, durées, paroles, accords, texte, transposition et panneau MNX |
| [engrave.js](./engrave.js) | Options des sélecteurs de mise en page et tailles de portée |
| [play.js](./play.js) | Sons, salle et affichage du temps |
| [review.js](./review.js) | Configuration de l'historique |
| [publish.js](./publish.js) | Sélection des mises en page et fenêtre de format d'export |

Roll utilise actuellement son HTML et les interactions du socle commun ;
il n'a pas de gestionnaire JavaScript spécifique.
Le socle [navigation.js](../navigation.js) conserve la navigation générale,
les fenêtres, les événements, le clavier et le focus.

## Contrat d'une fonctionnalité

Chaque fichier enregistre un objet :

```javascript
window.staticNavigationData.features.push({
  name: "custom",
  activate(ui) {
    if (ui.action === "custom:hello") {
      ui.notify("Action reçue dans mon fichier.");
      return;
    }
    return false;
  }
});
```

`name` identifie la fonctionnalité. `activate`, `input`, `forms` et `choices`
sont optionnels : [engrave.js](./engrave.js) ne déclare par exemple que des choix.

### Ordre et propagation

Les gestionnaires sont consultés dans l'ordre des scripts de
[index.html](../../index.html), indépendamment du mode affiché.
Utiliser `ui.screen` ou `ui.overlay` pour limiter une action à un contexte.

- Retourner **exactement `false`** si l'action ne concerne pas le gestionnaire.
- Toute autre valeur, y compris `undefined`, signifie « action prise en charge ».
- Retourner la Promise d'une action asynchrone reconnue pour propager ses erreurs.
- Ne pas déclarer `activate` en `async` : un `false` deviendrait une Promise
  et empêcherait la consultation des gestionnaires suivants.

Les actions communes comme les changements de mode, onglets, options,
`Close` et `Cancel` sont traitées avant ces gestionnaires.
Pour changer une action existante, modifier son gestionnaire actuel : un fichier
ajouté après celui-ci ne pourra pas intercepter une action déjà consommée.

Les clics sur les contrôles natifs `input`, `textarea` et `select` ne sont pas
détournés vers `activate`. Leur saisie peut être traitée dans `input(ui)`.

## Le contexte `ui`

Ce contexte est fourni à `activate(ui)` et `input(ui)` ; ce n'est pas une API
globale disponible directement sous `window.ui`.

| Propriété | Contenu |
| --- | --- |
| `action` | Action résolue depuis le libellé accessible, le menu ou `data-ui` |
| `element` | Contrôle activé ou champ ayant émis l'événement `input` |
| `role` | Attribut `role` du contrôle, éventuellement `null` |
| `screen` | Identifiant de l'écran courant, par exemple `write:History` |
| `overlay` | Identifiant de la fenêtre courante ; chaîne vide s'il n'y en a pas |
| `returnFocus` | Élément mémorisé pour le retour du focus, éventuellement absent |
| `app` | Conteneur DOM de l'écran |
| `overlays` | Conteneur DOM des fenêtres et menus |

`screen`, `overlay` et `returnFocus` sont des getters : relire `ui.overlay`
après une fermeture pour connaître la fenêtre restaurée, plutôt que réutiliser
une ancienne valeur déstructurée.

### Principales fonctions

| Fonction | Effet |
| --- | --- |
| `showScreen(nom)` | Charger un écran du manifeste ; retourne une Promise |
| `showOverlay(nom, bouton, imbrique = false)` | Charger une fenêtre ou un menu du manifeste ; retourne une Promise |
| `showForm(nom, bouton, imbrique = false)` | Construire un formulaire déclaré dans `forms` |
| `closeOverlay()` | Fermer ou restaurer la fenêtre parente |
| `clearOverlay()` | Retirer toutes les fenêtres et oublier leur chaîne de retour |
| `choose(bouton, options)` | Ouvrir une liste de choix textuels |
| `setChoice(bouton, valeur)` | Actualiser le libellé et `data-value` d'un sélecteur compatible |
| `notify(message)` | Afficher une notification temporaire |
| `preview()` | Afficher le message standard de démonstration |

Les noms de `showScreen` et `showOverlay` sont les clés de
[manifest.json](../../interfaces/manifest.json), pas des chemins de fichiers.
Les noms de `showForm` sont les clés de `forms` ; la fenêtre active est alors
identifiée par `form:nom`.

Pour une fenêtre imbriquée, passer `true` en troisième argument afin de
mémoriser le parent. Pour un menu contextuel, passer le bouton déclencheur
permet au socle de positionner la liste.

Les fonctions `label`, `controlLabel`, `make`, `template`, `prepare` et
`resetOverlayHistory` sont également exposées pour les besoins internes.
Pour une action courante, privilégier les fonctions du tableau.

## Ajouter un formulaire dans un nouveau fichier

### 1. Créer `custom.js`

```javascript
"use strict";

window.staticNavigationData.features.push({
  name: "custom",
  forms: {
    "custom-note": {
      title: "Ma note",
      description: "Saisie locale de démonstration.",
      fields: [
        { label: "Titre", value: "Sans titre" },
        { label: "Texte", type: "textarea" },
        { label: "Style", options: ["Normal", "Important"] }
      ]
    }
  },
  activate(ui) {
    if (ui.action === "custom:note") {
      return ui.showForm("custom-note", ui.element, Boolean(ui.overlay));
    }
    return false;
  },
  input(ui) {
    if (ui.overlay === "form:custom-note" &&
        ui.element.matches('input[aria-label="Titre"]')) {
      ui.notify("Titre saisi : " + ui.element.value);
    }
  }
});
```

Les champs reconnus sont `label`, `type`, `value`, `accept` et `options`.
Sans `type` ni `options`, le champ est textuel. `options` construit un sélecteur
natif. Les champs numériques générés ont actuellement un minimum de 1.

Les formulaires générés possèdent des boutons Cancel et Aperçu. Leur
confirmation utilise l'action commune `static-confirm`, traitée dans
[project.js](./project.js) : elle ferme le formulaire et affiche une
notification, sans enregistrer son contenu.
Pour une validation métier spécifique, adapter ce gestionnaire en vérifiant
`ui.overlay`, ou créer une fenêtre HTML avec un bouton d'action distinct.

### 2. Charger le script

Ajouter dans [index.html](../../index.html), après `navigation-data.js`
et avant `navigation.js` :

```html
<script defer src="./assets/features/custom.js"></script>
```

Conserver `name: "custom"` pour un fichier `custom.js` : la page de tests
utilise cette correspondance pour identifier les scripts de fonctionnalités.
Choisir des noms uniques pour les fonctionnalités, formulaires et choix.
Les données sont regroupées au démarrage ; recharger la page après modification.

### 3. Ajouter le bouton dans un fragment HTML

```html
<button type="button" data-ui="custom:note">Ouvrir ma note</button>
```

Ne pas ajouter d'attribut `onclick` : la politique CSP interdit les gestionnaires
JavaScript intégrés au HTML. Pour une fenêtre avec une structure personnalisée,
suivre plutôt le [guide des fragments HTML](../../interfaces/README.md).

## Ajouter des choix

Déclarer `choices` dans la fonctionnalité appropriée, par exemple :

```javascript
choices: {
  "Style de note": ["Normal", "Important", "Secondaire"]
}
```

Le sélecteur doit être reconnu comme combobox ou avoir `aria-haspopup`, et
son libellé de contrôle doit correspondre à la clé déclarée.
On peut aussi ouvrir explicitement une liste depuis `activate` :

```javascript
if (ui.action === "custom:style") {
  return ui.choose(ui.element, ["Normal", "Important", "Secondaire"]);
}
```

Les choix de toutes les fonctionnalités sont communs : ceux d'Engrave servent
notamment dans les réglages Page Defaults. Des clés dupliquées sont remplacées
par celles des fonctionnalités chargées ensuite.

## Précautions et vérification

- Garder les actions simulées tant qu'aucune logique réelle n'est explicitement branchée.
- Retourner les Promises de navigation pour que le socle affiche les erreurs.
- Garder `input(ui)` synchrone ; sa valeur de retour n'est pas attendue.
- Éviter les écouteurs DOM supplémentaires dans les fragments : le socle délègue
  déjà les clics et la saisie, même après remplacement d'un écran.
- Préférer `textContent` pour afficher des valeurs fournies par l'utilisateur.
- Ne pas conserver une référence à un champ après remplacement de son écran :
  retrouver le contrôle dans `ui.app` ou `ui.overlays`.
- Recharger la maquette puis exécuter la page de tests indiquée dans le
  [guide d'utilisation](../../README.md), et vérifier aussi le nouveau parcours
  avec un clic réel et au clavier.
