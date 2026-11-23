# Modifier les écrans et fenêtres

[Démarrage et utilisation](../README.md) ·
[Actions JavaScript](../assets/features/README.md)

## Organisation

- [screens/](./screens/) contient les écrans complets et leurs variantes d'onglets.
- [dialogs/](./dialogs/) contient les fenêtres, menus et listes contextuelles.
- [manifest.json](./manifest.json) associe chaque identifiant à un fragment HTML.

Les fichiers HTML de ces dossiers sont des **fragments chargés par le socle**,
pas des pages autonomes. Les ouvrir directement ne charge ni les styles ni la
navigation de l'application.

Quelques points d'entrée :

| Interface | Fichier |
| --- | --- |
| Setup | [setup.html](./screens/setup.html) |
| Onglet Project | [setup-project.html](./screens/setup-project.html) |
| Onglet Scores | [setup-scores.html](./screens/setup-scores.html) |
| Write | [write.html](./screens/write.html) |
| Engrave | [engrave.html](./screens/engrave.html) |
| Play | [play.html](./screens/play.html) |
| Roll | [roll.html](./screens/roll.html) |
| Review | [review.html](./screens/review.html) |
| Publish | [publish.html](./screens/publish.html) |
| Accueil | [start.html](./dialogs/start.html) |
| Nouveau projet | [new-project.html](./dialogs/new-project.html) |
| Menu File | [menu-file.html](./dialogs/menu-file.html) |
| Réglages Appearance | [settings-appearance.html](./dialogs/settings-appearance.html) |

Le manifeste donne la liste complète. Plusieurs identifiants peuvent pointer
vers le même fichier : `write` et `write:Palettes` utilisent par exemple
[write.html](./screens/write.html).

## Modifier un écran existant

1. Retrouver son identifiant et son chemin dans le manifeste.
2. Modifier le fragment HTML correspondant.
3. Conserver les classes existantes pour préserver son apparence.
4. Conserver les attributs de navigation et d'accessibilité.
5. Recharger complètement l'application avant de vérifier le résultat.

Les écrans sont des captures indépendantes : leur en-tête ou leur barre latérale
peuvent être répétés dans plusieurs fichiers. Un changement de structure partagé
doit donc être répercuté dans les variantes concernées. Pour un changement
purement visuel commun, préférer une règle CSS partagée.

### Attributs importants

| Attribut | Usage |
| --- | --- |
| `data-activity` | Identifiant du mode dans la barre latérale |
| `data-ui` | Identifiant d'action d'un contrôle |
| `aria-label`, `aria-labelledby` | Nom accessible ; peut aussi déterminer l'action JavaScript |
| `role`, `aria-selected`, `aria-pressed`, `aria-expanded` | Navigation au clavier et état visuel |
| `id`, `for` | Association entre libellés, champs et cibles |
| `disabled`, `aria-disabled` | Contrôle non activable |

Attention : `aria-label` et le texte désigné par `aria-labelledby` ont priorité
sur `data-ui` dans la résolution de l'action. Changer un libellé accessible peut
donc nécessiter de modifier le gestionnaire JavaScript correspondant.
Pour les éléments de menu, le texte du premier enfant peut également être utilisé.

## Ajouter un bouton

Insérer un bouton dans le fragment souhaité :

```html
<button type="button" data-ui="custom:details">
  Afficher les détails
</button>
```

Le texte visible fournit ici le nom accessible ; `data-ui` fournit l'action.
Ne pas ajouter d'attribut `onclick` ou de script dans le fragment.
Le socle délègue les événements aux fichiers de fonctionnalités.

Ajouter ensuite une branche dans le gestionnaire approprié, comme expliqué
dans le [guide JavaScript](../assets/features/README.md).
Utiliser un identifiant spécifique plutôt qu'un nom générique comme `Open`.

## Ajouter une fenêtre HTML

### 1. Créer le fragment

Par exemple, créer `dialogs/custom-details.html` avec :

```html
<div class="static-dialog-backdrop" data-dialog-overlay="true"></div>
<section class="static-dialog" role="dialog"
         aria-labelledby="custom-details-title" tabindex="-1">
  <header>
    <h2 id="custom-details-title">Détails</h2>
    <button type="button" data-ui="Close">Fermer</button>
  </header>
  <section>
    <p>Contenu de la nouvelle fenêtre.</p>
  </section>
</section>
```

Les classes réutilisent les styles de la maquette. Le socle reconnaît
`.static-dialog`, gère le focus, rend l'écran sous-jacent inactif et permet
la fermeture par Échap. L'action `Close` est déjà prise en charge.

### 2. Déclarer le chemin

Ajouter une entrée dans l'objet JSON du manifeste :

```json
"custom:details": {
  "kind": "overlay",
  "path": "./interfaces/dialogs/custom-details.html"
}
```

Conserver les virgules nécessaires entre les entrées JSON.
Les chemins du manifeste sont relatifs à la page d'entrée
[index.html](../index.html), **pas au fichier manifeste**.

### 3. Ouvrir la fenêtre

Dans `activate(ui)` du fichier de fonctionnalité choisi :

```javascript
if (ui.action === "custom:details") {
  return ui.showOverlay("custom:details", ui.element);
}
```

Si cette fenêtre doit revenir à une fenêtre parente à la fermeture :

```javascript
return ui.showOverlay("custom:details", ui.element, true);
```

Pour un simple formulaire sans mise en page particulière, préférer une
déclaration `forms` et `showForm()` : aucun fragment HTML ni ajout au manifeste
n'est alors nécessaire.

## Écrans, onglets et styles

Un nouvel écran se déclare avec `"kind": "screen"` et s'ouvre avec
`ui.showScreen("identifiant")`. Ajouter un fichier au manifeste ne crée pas
automatiquement un bouton dans l'interface.

Les onglets d'écran sont résolus sous la forme `mode:libellé`, par exemple
`setup:Scores`. Les catégories de réglages utilisent `settings:libellé`.
Respecter la casse et les espaces.

Les styles d'origine sont dans
[interface.css](../assets/interface.css) et
[notation.css](../assets/notation.css).
Pour les adaptations, privilégier
[navigation.css](../assets/navigation.css) et des classes propres au nouveau
contenu. Éviter les changements globaux sur tous les boutons ou toutes les fenêtres.

Après modification, vérifier le rendu, la navigation au clavier, Échap,
le retour à la fenêtre parente et la page de tests décrite dans le
[guide d'utilisation](../README.md).
