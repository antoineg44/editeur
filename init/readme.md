# Problème de génération de certificat :
sudo certbot certonly --manual --preferred-challenges dns -d editeur.partitions.ovh

Dans la zone DNS de ton domaine OVH, ajoute un enregistrement :
Champ               Valeur
Type	            TXT
Sous-domaine	    _acme-challenge.editeur
Zone text           xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

relancer ensuite le script
