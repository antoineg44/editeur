# Utiliser l'interface Viritura

Cette interface est une **maquette statique navigable** : elle conserve les
écrans, boutons, menus et fenêtres de Viritura, sans moteur musical ni serveur
applicatif.

## 1. Démarrer

Prérequis : un navigateur récent, JavaScript activé et un serveur HTTP statique.
Python permet de lancer ce serveur sans installer de dépendances au projet.

Depuis la racine du dépôt `editeur`, exécuter dans PowerShell :

```powershell
py -m http.server 8766 --bind 127.0.0.1 --directory public
```

Si la commande `py` n'est pas disponible mais que Python est accessible avec
`python`, remplacer `py` par `python`.

Ouvrir ensuite <http://127.0.0.1:8766/temp/>.
Laisser le terminal ouvert pendant l'utilisation ; `Ctrl+C` arrête le serveur.
Ne pas ouvrir [index.html](./index.html) par double-clic en `file://` :
le chargement des fragments HTML nécessite HTTP.

Aucun build, npm, React ou WASM n'est nécessaire.

## 2. Naviguer

Sans fragment dans l'URL, le centre d'accueil s'ouvre au-dessus du mode Write.
Le fermer pour accéder à la barre latérale.

| Mode | Interface présentée |
| --- | --- |
| Setup | Projet, instruments, scores et accordage |
| Write | Palettes, durées, paroles, accords et propriétés |
| Engrave | Mise en page, styles et dispositions |
| Play | Mixeur et sélecteurs de sons |
| Roll | Présentation du piano-roll |
| Review | Historique |
| Publish | Options de publication et d'export |

Les menus File, Edit, View et Help, les onglets et le bouton Settings donnent
accès aux autres interfaces. Certains contrôles restent désactivés lorsque
l'interface d'origine les présente ainsi.

Les entrées Connect MCP Client, Sign In, Live session et le mode Picture
ne font pas partie de cette interface.

Pour ouvrir directement un écran, utiliser son identifiant après `#` :

- <http://127.0.0.1:8766/temp/#write>
- <http://127.0.0.1:8766/temp/#publish>
- <http://127.0.0.1:8766/temp/#setup%3AScores> pour `setup:Scores`.

Ces liens concernent les écrans, pas les fenêtres modales. Les identifiants
sont définis dans [manifest.json](./interfaces/manifest.json).

### Raccourcis

| Touche | Action dans la maquette |
| --- | --- |
| Échap | Fermer la fenêtre ou revenir à sa fenêtre parente |
| F1 | Afficher les raccourcis |
| Ctrl+N | Ouvrir le formulaire de nouveau projet |
| Ctrl+O | Ouvrir le formulaire de choix de fichier |
| Ctrl+P | Passer en mode Publish, sans lancer l'impression du navigateur |
| Ctrl+, | Ouvrir les réglages Appearance |
| Ctrl+S | Afficher une notification de démonstration, sans sauvegarder |
| Tab / Maj+Tab | Déplacer le focus entre les contrôles |
| Flèches, Début, Fin | Déplacer le focus dans les menus et groupes compatibles |
| Entrée / Espace | Activer le contrôle ciblé |

Les raccourcis Ctrl ci-dessus sont également reconnus avec la touche Meta.

## 3. Ce qui fonctionne et ce qui reste simulé

La navigation, les fenêtres imbriquées, les champs, les sélecteurs, les
recherches prévues et les thèmes permettent d'explorer le visuel.

En revanche :

- aucune partition n'est rendue ou éditée par un moteur musical ;
- aucune lecture audio ou vidéo réelle n'est effectuée ;
- aucun compte, service distant ou appel API n'est utilisé ;
- les actions d'import, d'export et d'enregistrement restent des démonstrations ;
- choisir un fichier ne provoque ni lecture de son contenu ni téléversement ;
- les valeurs ne sont pas sauvegardées après rechargement de la page.

Une notification « Maquette statique » signale une action simulée : ce n'est
pas une confirmation de sauvegarde ou de connexion.

## 4. Modifier ou réutiliser l'interface

| Besoin | Guide |
| --- | --- |
| Modifier un écran, un menu ou une fenêtre HTML | [Guide des interfaces](./interfaces/README.md) |
| Brancher une fonction sur un bouton ou ajouter un formulaire | [Guide des fonctionnalités JavaScript](./assets/features/README.md) |
| Comprendre le point d'entrée et l'ordre des scripts | [index.html](./index.html) |
| Adapter les styles communs | [navigation.css](./assets/navigation.css) |

Pour héberger la maquette ailleurs, conserver **tout le contenu de ce dossier**,
y compris les interfaces, scripts, styles, images, polices et licences.
Les chemins sont relatifs : le dossier peut être servi dans un sous-dossier.
Un hébergement purement statique suffit ; conserver les extensions et servir
les fichiers JavaScript avec un type MIME compatible.

La politique CSP de la page bloque notamment les scripts externes et les
connexions vers d'autres origines. Une intégration avec un serveur doit être
conçue explicitement ; elle ne se fait pas en renseignant un simple champ.

## 5. Vérifier les changements

Avec le serveur lancé depuis la racine du dépôt comme indiqué plus haut, ouvrir :

<http://127.0.0.1:8766/test/static-interface.html>

La page de tests vérifie les principaux parcours dans une iframe et affiche
son résultat. Elle se trouve hors de ce dossier, dans
[static-interface.html](../test/static-interface.html).
Après une modification, recharger également cette page de tests.

## 6. Dépannage

| Symptôme | Vérification |
| --- | --- |
| Le navigateur ne se connecte pas | Vérifier que le serveur tourne encore et que le port est correct |
| Le port 8766 est déjà utilisé | Choisir un autre port dans la commande et dans toutes les URL |
| Erreur HTTP 404 sur `/temp/` | Lancer la commande depuis la racine du dépôt avec `--directory public` |
| Message demandant un serveur HTTP | Ne pas ouvrir la page en `file://` |
| Ancienne version d'un écran ou d'une action | Recharger complètement la page, au besoin avec Ctrl+F5 ; les fragments sont aussi gardés en mémoire pendant la session |
| Un bouton affiche seulement une notification | L'action est simulée ou n'a pas encore de gestionnaire spécifique |
| Une interface ne s'ouvre plus | Consulter la notification, la console et l'onglet Réseau du navigateur pour trouver le fichier ou l'identifiant en cause |

## Licences

Les visuels et styles conservés de Viritura sont accompagnés de la
[licence MIT](./assets/licenses/Viritura-MIT.txt).
La police Bravura est accompagnée de sa
[licence OFL](./assets/licenses/Bravura-OFL.txt).
Conserver ces mentions lors d'une redistribution.
