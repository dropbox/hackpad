Installation
--------------

Selenium:
sudo pip install -U selenium

ImageMagick:
http://www.imagemagick.org/script/binary-releases.php

PIL:
https://developers.google.com/appengine/docs/python/images/installingPIL

Wand:
sudo pip install Wand

(mac users might need to export MAGICK_HOME=/opt/local)



Pre-requistes on website
--------------
jQuery (for sendkeys library support)



Setup
--------------
Edit global.cfg
  - required: command_executor
  - optional: cookie_* values



Running
--------------
./run.py


Comparing/Saving
--------------
./compare.py
