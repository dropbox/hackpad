#!/usr/bin/env python

import re
import os
import sys
import copy
import time
import signal
import StringIO
import hashlib
import subprocess
import ConfigParser
from optparse import OptionParser, OptionGroup

try:
    from PIL import PImage
    from PIL import PngImagePlugin
except:
    import Image as PImage
    import PngImagePlugin

__version__ = '0.3'


PADDING_REGEXP = re.compile("^(\d+-?){,3}\d+$")

TRANSPARENT = (255, 255, 255, 0)
CAMELCASE_SEPARATOR = 'camelcase'
CONFIG_FILENAME = 'sprite.conf'
ORDERINGS = ['maxside', 'width', 'height', 'area']
VALID_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif']
PSEUDO_CLASSES = set(['link', 'visited', 'active', 'hover', 'focus',
                      'first-letter', 'first-line', 'first-child',
                      'before', 'after'])

DEFAULT_SETTINGS = {
    'padding': '0',
    'margin': '0',
    'algorithm': 'square',
    'ordering': 'maxside',
    'namespace': 'sprite',
    'sprite_namespace': '%(sprite)s',
    'crop': False,
    'url': '',
    'less': False,
    'force': False,
    'optipng': False,
    'html': False,
    'ignore_filename_paddings': False,
    'png8': False,
    'ratios': '',
    'retina': False,
    'imagemagick': False,
    'imagemagickpath': 'convert',
    'separator': '-',
    'optipngpath': 'optipng',
    'optipng': False,
    'project': False,
    'recursive': False,
    'follow_links': False,
    'quiet': False,
    'no_css': False,
    'no_img': False,
    'cachebuster': False,
    'cachebuster-filename': False,
    'global_template':
        ('%(all_classes)s{background-image:url(\'%(sprite_url)s\');'
         'background-repeat:no-repeat}\n'),
    'each_template':
        ('%(class_name)s{background-position:%(x)s %(y)s;'
         'width:%(width)s;height:%(height)s;}\n'),
    'ratio_template':
        ('@media '
         'only screen and (-webkit-min-device-pixel-ratio: %(ratio)s), '
         'only screen and (min--moz-device-pixel-ratio: %(ratio)s), '
         'only screen and (-o-min-device-pixel-ratio: %(ratio_fraction)s), '
         'only screen and (min-device-pixel-ratio: %(ratio)s) {'
         '%(all_classes)s{background-image:url(\'%(sprite_url)s\');'
         '-webkit-background-size: %(width)s %(height)s;'
         '-moz-background-size: %(width)s %(height)s;'
         'background-size: %(width)s %(height)s;'
         '}}\n')
    }

TEST_HTML_TEMPLATE = """
<html><head><title>Glue Sprite Test Html</title>
<link rel="stylesheet" type="text/css" href="%(css_url)s"></head><body>
<style type="text/css">tr div:hover{ border:1px solid #ccc;}
tr div{ border:1px solid white;}</style><h1>CSS Classes</h1><table>
<tr><th>CSS Class</th><th>Result</th></tr>%(sprites)s</table>
<p><em>Generated using <a href="http://gluecss.com"/>Glue v%(version)s</a>
</em></p></body></html>
"""

TEST_HTML_SPRITE_TEMPLATE = """
<tr><td>.%(class_name)s </td><td><div class="%(class_name)s"></div></td></tr>
"""


class MultipleImagesWithSameNameError(Exception):
    """Raised if two images pretend to generate the same CSS class name."""
    error_code = 2


class SourceImagesNotFoundError(Exception):
    """Raised if a folder doesn't contain any valid image."""
    error_code = 3


class NoSpritesFoldersFoundError(Exception):
    """Raised if no sprites folders could be found."""
    error_code = 4


class InvalidImageAlgorithmError(Exception):
    """Raised if the provided algorithm name is invalid."""
    error_code = 5


class InvalidImageOrderingError(Exception):
    """Raised if the provided ordering is invalid."""
    error_code = 6


class PILUnavailableError(Exception):
    """Raised if some PIL decoder isn't available."""
    error_code = 7


class _Missing(object):
    """ Missing object necessary for cached_property"""
    def __repr__(self):
        return 'no value'

    def __reduce__(self):
        return '_missing'

_missing = _Missing()


class cached_property(object):
    """
    Decorator inspired/copied from mitsuhiko/werkzeug.

    A decorator that converts a function into a lazy property.  The
    function wrapped is called the first time to retrieve the result
    and then that calculated result is used the next time you access
    the value"""

    def __init__(self, func, name=None, doc=None):
        self.__name__ = name or func.__name__
        self.__module__ = func.__module__
        self.__doc__ = doc or func.__doc__
        self.func = func

    def __get__(self, obj, type=None):
        if obj is None:
            return self
        value = obj.__dict__.get(self.__name__, _missing)
        if value is _missing:
            value = self.func(obj)
            obj.__dict__[self.__name__] = value
        return value


def round_up(value):
    int_value = int(value)
    diff = 1 if int_value > 0 else -1
    return int_value + diff if value != int_value else int_value


def nearest_fration(value):
    """
    Return the nearest fraction.
    If fraction.Fraction is not available, return a fraction.

    Note: used for Opera CSS pixel-ratio media queries.
    """
    try:
        from fraction import Fraction
        return str(Fraction(value))
    except ImportError:
        return '%i/100' % int(float(value) * 100)


class SquareAlgorithmNode(object):

    def __init__(self, x=0, y=0, width=0, height=0, used=False,
                 down=None, right=None):
        """Node constructor.

        :param x: X coordinate.
        :param y: Y coordinate.
        :param width: Image width.
        :param height: Image height.
        :param used: Flag to determine if the node is used.
        :param down: Down :class:`~Node`.
        :param right Right :class:`~Node`.
        """
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.used = used
        self.right = right
        self.down = down

    def find(self, node, width, height):
        """Find a node to allocate this image size (width, height).

        :param node: Node to search in.
        :param width: Pixels to grow down (width).
        :param height: Pixels to grow down (height).
        """
        if node.used:
            return self.find(node.right, width, height) or \
                   self.find(node.down, width, height)
        elif node.width >= width and node.height >= height:
            return node
        return None

    def grow(self, width, height):
        """ Grow the canvas to the most appropriate direction.

        :param width: Pixels to grow down (width).
        :param height: Pixels to grow down (height).
        """
        can_grow_d = width <= self.width
        can_grow_r = height <= self.height

        should_grow_r = can_grow_r and self.height >= (self.width + width)
        should_grow_d = can_grow_d and self.width >= (self.height + height)

        if should_grow_r:
            return self.grow_right(width, height)
        elif should_grow_d:
            return self.grow_down(width, height)
        elif can_grow_r:
            return self.grow_right(width, height)
        elif can_grow_d:
            return self.grow_down(width, height)

        return None

    def grow_right(self, width, height):
        """Grow the canvas to the right.

        :param width: Pixels to grow down (width).
        :param height: Pixels to grow down (height).
        """
        old_self = copy.copy(self)
        self.used = True
        self.x = self.y = 0
        self.width += width
        self.down = old_self
        self.right = SquareAlgorithmNode(x=old_self.width,
                                         y=0,
                                         width=width,
                                         height=self.height)

        node = self.find(self, width, height)
        if node:
            return self.split(node, width, height)
        return None

    def grow_down(self, width, height):
        """Grow the canvas down.

        :param width: Pixels to grow down (width).
        :param height: Pixels to grow down (height).
        """
        old_self = copy.copy(self)
        self.used = True
        self.x = self.y = 0
        self.height += height
        self.right = old_self
        self.down = SquareAlgorithmNode(x=0,
                                        y=old_self.height,
                                        width=self.width,
                                        height=height)

        node = self.find(self, width, height)
        if node:
            return self.split(node, width, height)
        return None

    def split(self, node, width, height):
        """Split the node to allocate a new one of this size.

        :param node: Node to be splitted.
        :param width: New node width.
        :param height: New node height.
        """
        node.used = True
        node.down = SquareAlgorithmNode(x=node.x,
                                        y=node.y + height,
                                        width=node.width,
                                        height=node.height - height)
        node.right = SquareAlgorithmNode(x=node.x + width,
                                         y=node.y,
                                         width=node.width - width,
                                         height=height)
        return node


class SquareAlgorithm(object):

    def process(self, sprite):

        root = SquareAlgorithmNode(width=sprite.images[0].absolute_width,
                    height=sprite.images[0].absolute_height)

        # Loot all over the images creating a binary tree
        for image in sprite.images:
            node = root.find(root, image.absolute_width, image.absolute_height)
            if node:  # Use this node
                node = root.split(node, image.absolute_width,
                                        image.absolute_height)
            else:  # Grow the canvas
                node = root.grow(image.absolute_width, image.absolute_height)

            image.x = node.x
            image.y = node.y


class VerticalAlgorithm(object):

    def process(self, sprite):
        y = 0
        for image in sprite.images:
            image.x = 0
            image.y = y
            y += image.absolute_height


class VerticalRightAlgorithm(object):

    def process(self, sprite):
        max_width = max([i.width for i in sprite.images])
        y = 0
        for image in sprite.images:
            image.x = max_width - image.width
            image.y = y
            y += image.absolute_height


class HorizontalAlgorithm(object):

    def process(self, sprite):
        x = 0
        for image in sprite.images:
            image.y = 0
            image.x = x
            x += image.absolute_width


class HorizontalBottomAlgorithm(object):

    def process(self, sprite):
        max_height = max([i.height for i in sprite.images])
        x = 0
        for image in sprite.images:
            image.y = max_height - image.height
            image.x = x
            x += image.absolute_width


class DiagonalAlgorithm(object):

    def process(self, sprite):
        x = y = 0
        for image in sprite.images:
            image.x = x
            image.y = y
            x += image.absolute_width
            y += image.absolute_height


ALGORITHMS = {'square': SquareAlgorithm,
              'vertical': VerticalAlgorithm,
              'vertical-right': VerticalRightAlgorithm,
              'horizontal': HorizontalAlgorithm,
              'horizontal-bottom': HorizontalBottomAlgorithm,
              'diagonal': DiagonalAlgorithm}


class Image(object):

    def __init__(self, name, sprite, path=None):
        """Image constructor

        :param name: Image name.
        :param sprite: :class:`~Sprite` instance for this image."""
        self.x = None
        self.y = None
        self.name = name
        self.sprite = sprite
        self.filename, self.format = name.rsplit('.', 1)

        if '_' in self.filename:
            pseudo = set(self.filename.split('_')).intersection(PSEUDO_CLASSES)
            self.pseudo = ':%s' % list(pseudo)[-1] if pseudo else ''
        else:
            self.pseudo = ''

        self.path = path or os.path.join(sprite.path, name)

        with open(self.path, "rb") as image_file:
            self._data = image_file.read()

    @cached_property
    def image(self):
        """Return a Pil representation of this image """
        io = StringIO.StringIO(self._data)
        try:
            source_image = PImage.open(io)
            img = PImage.new('RGBA', source_image.size, (0, 0, 0, 0))

            if source_image.mode == 'L':
                alpha = source_image.split()[0]
                transparency = source_image.info.get('transparency')
                mask = PImage.eval(alpha, lambda a: 0 if a == transparency else 255)
                img.paste(source_image, (0, 0), mask=mask)
            else:
                img.paste(source_image, (0, 0))
        except IOError, e:
            raise PILUnavailableError(e.args[0].split()[1])
        finally:
            io.close()

        # Crop the image searching for the smallest possible bounding box
        # without losing any non-transparent pixel.
        # This crop is only used if the crop flag is set in the config.

        if self.sprite.config.crop:
            width, height = img.size
            maxx = maxy = 0
            minx = miny = sys.maxint

            for x in xrange(width):
                for y in xrange(height):
                    if y > miny and y < maxy and maxx == x:
                        continue
                    if img.getpixel((x, y)) != TRANSPARENT:
                        if x < minx:
                            minx = x
                        if x > maxx:
                            maxx = x
                        if y < miny:
                            miny = y
                        if y > maxy:
                            maxy = y
            img = img.crop((minx, miny, maxx + 1, maxy + 1))

        return img

    @cached_property
    def width(self):
        """Return Image width"""
        return self.image.size[0]

    @cached_property
    def height(self):
        """Return Image height"""
        return self.image.size[1]

    @cached_property
    def absolute_width(self):
        """Return the total width of the image taking count of the margin,
        padding and ratio."""
        margin = int(self.sprite.config.margin)
        return round_up(self.width +
                (self.horizontal_padding + 2 * margin) * self.sprite.max_ratio)

    @cached_property
    def absolute_height(self):
        """Return the total height of the image taking count of the margin,
        padding and ratio.
        """
        margin = int(self.sprite.config.margin)
        return round_up(self.height +
                (self.vertical_padding + 2 * margin) * self.sprite.max_ratio)

    def _generate_padding(self, padding):
        """Return a 4-elements list with the desired padding.

        :param padding: Padding as a list or a raw string representing
                        the padding for this image."""

        if type(padding) == str:
            padding = padding.replace('px', '').split()

        if len(padding) == 4:
            padding = padding
        elif len(padding) == 3:
            padding = padding + [padding[1]]
        elif len(padding) == 2:
            padding = padding * 2
        elif len(padding) == 1:
            padding = padding * 4
        else:
            padding = [DEFAULT_SETTINGS['padding']] * 4
        return map(int, padding)

    @cached_property
    def class_name(self):
        """Return the CSS class name for this file.

        This CSS class name will have the following format:

        ``.[namespace]-[sprite-namespace]-[image_name]{ ... }``

        The image_name will only contain alphanumeric characters,
        ``-`` and ``_``. The default namespace is ``sprite``, but it could
        be overridden using the ``--namespace`` optional argument.

        * ``animals/cat.png`` will be ``.sprite-animals-cat``
        * ``animals/cow_20.png`` will be ``.sprite-animals-cow``
        * ``animals/cat_hover.png`` will be ``.sprite-animals-cat:hover``
        * ``animals/cow_20_hover.png`` will be ``.sprite-animals-cow:hover``

        The separator used is also configurable using the ``--separator``
        option. For a camelCase representation of the CSS class name use
        ``camelcase`` as separator.
        """
        name = self.filename

        # Remove padding information
        if not self.sprite.manager.config.ignore_filename_paddings:
            padding_info_name = '-'.join(self._padding_info)
            if padding_info_name:
                padding_info_name = '_%s' % padding_info_name
            name = name.replace(padding_info_name, '')

        # Remove pseudo-class information
        if self.pseudo:
            name = name.replace('_%s' % self.pseudo[1:], '')

        # Clean filename
        name = re.sub(r'[^\w\-_]', '', name)

        separator = self.sprite.manager.config.separator

        # Add pseudo-class information
        name = '%s%s' % (name, self.pseudo)

        # Create the minimal namespace
        namespace = [name]

        # Add sprite namespace if required
        if self.sprite.manager.config.sprite_namespace:
            sprite_name = re.sub(r'[^\w\-_]', '', self.sprite.name)
            namespace.insert(0, self.sprite.manager.config.sprite_namespace % {'sprite': sprite_name})

        # Add global namespace if required
        if self.sprite.manager.config.namespace:
            namespace.insert(0, self.sprite.manager.config.namespace)

        # Handle CamelCase separator
        if separator == CAMELCASE_SEPARATOR:
            namespace = [n[:1].title() + n[1:] if i > 0 else n for i, n in enumerate(namespace)]
            separator = ''

        return separator.join(namespace)

    @cached_property
    def _padding_info(self):
        """Return the padding information from the filename."""
        for block in self.filename.split('_')[:0:-1]:
            if PADDING_REGEXP.match(block):
                return block.split('-')
        return []

    @cached_property
    def padding(self):
        """Return the padding for this image based on the filename and
        the sprite settings file.

        * ``filename.png`` will have the default padding ``10px``.
        * ``filename_20.png`` -> ``20px`` all around the image.
        * ``filename_1-2-3.png`` -> ``1px 2px 3px 2px`` around the image.
        * ``filename_1-2-3-4.png`` -> ``1px 2px 3px 4px`` around the image.

        """
        padding = self._padding_info
        if len(padding) == 0 or \
           self.sprite.manager.config.ignore_filename_paddings:
            padding = self.sprite.config.padding
        return self._generate_padding(padding)

    @cached_property
    def horizontal_padding(self):
        """Return the horizontal padding for this image."""
        return self.padding[1] + self.padding[3]

    @cached_property
    def vertical_padding(self):
        """Return the vertical padding for this image."""
        return self.padding[0] + self.padding[2]

    def __lt__(self, img):
        """Use maxside, width, height or area as ordering algorithm.

        :param img: Another :class:`~Image`."""
        ordering = self.sprite.config.ordering
        ordering = ordering[1:] if ordering.startswith('-') else ordering

        if ordering not in ORDERINGS:
            raise InvalidImageOrderingError(ordering)

        if ordering == 'width':
            return self.absolute_width <= img.absolute_width
        elif ordering == 'height':
            return self.absolute_height <= img.absolute_height
        elif ordering == 'area':
            return self.absolute_width * self.absolute_height <= \
                   img.absolute_width * img.absolute_height
        else:
            return max(self.absolute_width, self.absolute_height) <= \
                   max(img.absolute_width, img.absolute_height)


class Sprite(object):

    def __init__(self, name, path, manager):
        """Sprite constructor.

        :param name: Sprite name.
        :param path: Sprite path
        :param manager: Sprite manager. :class:`~ProjectSpriteManager` or
                        :class:`SimpleSpriteManager`"""
        self.name = name
        self.manager = manager
        self.images = []
        self.path = path
        self._processed = False

        self.config = manager.config.extend(get_file_config(self.path))

        # Build the set of ratios this sprite needs.
        ratios = self.config.ratios.split(',')
        self.ratios = set([float(r.strip()) for r in ratios if r.strip()])

        # If the retina shortcut is in use add 2.0 as a required ratio.
        if self.config.retina:
            self.ratios.add(2.0)

        # Always add 1.0 as a required ratio
        self.ratios.add(1.0)

        # Create a sorted list of ratios
        self.ratios = sorted(self.ratios)

        # Locate images
        self.images = self._locate_images()

    def validate(self):
        """Validate this sprite cheking that all images will have different
        CCS class names.
        """
        class_names = [i.class_name for i in self.images]
        if len(set(class_names)) != len(self.images):
            dup = [i for i in self.images if class_names.count(i.class_name) > 1]
            raise MultipleImagesWithSameNameError(dup)

        for image in self.images:
            self.manager.log("\t %s => .%s" % (image.name, image.class_name))

        return True

    def process(self):
        """Process a sprite path searching for all the images and then
        allocate all of them in the most appropriate position.
        """
        if self._processed:
            return

        algorithm = ALGORITHMS.get(self.config.algorithm)

        if not algorithm:
            raise InvalidImageAlgorithmError(self.config.algorithm)

        self.algorithm = algorithm()
        self.images = sorted(self.images, reverse=self.config.ordering[0] != '-')
        self.algorithm.process(self)
        self._processed = True

    def _locate_images(self):
        """Return all valid images within a folder.

        All files with a extension not included i
        (png, jpg, jpeg and gif) or beginning with '.' will be ignored.

        If the folder doesn't contain any valid image it will raise
        :class:`~MultipleImagesWithSameNameError`

        The list of images will be ordered using the desired ordering
        algorithm. The default is 'maxside'.
        """
        extensions = '|'.join(VALID_IMAGE_EXTENSIONS)
        extension_re = re.compile('.+\.(%s)$' % extensions, re.IGNORECASE)
        files = sorted(os.listdir(self.path))

        images = []
        for root, dirs, files in os.walk(self.path, followlinks=self.config.follow_links):
            for f in sorted(files):
                if not f.startswith('.') and extension_re.match(f):
                    images.append(Image(f, path=os.path.join(root, f), sprite=self))
            if not self.config.recursive:
                break

        if not images:
            raise SourceImagesNotFoundError(self.path)

        return images

    @cached_property
    def canvas_size(self):
        """Return the width and height for this sprite canvas"""
        width = height = 0
        for image in self.images:
            x = image.x + image.absolute_width
            y = image.y + image.absolute_height
            if width < x:
                width = x
            if height < y:
                height = y
        return round_up(width), round_up(height)

    def save_image(self):
        """Create the image file for this sprite."""

        if self.config.no_img:
            return

        # Check if we need to create any sprite.
        ratios_to_process = []

        for ratio in self.ratios:
            sprite_image_path = self.image_path(ratio)
            try:
                assert not self.config.force
                existing_sprite = PImage.open(sprite_image_path)
                assert existing_sprite.info['Software'] == 'glue-%s' % __version__
                assert existing_sprite.info['Comment'] == self.hash
                already_created = True
            except Exception:
                already_created = False

            if not already_created:
                ratios_to_process.append(ratio)

        if not ratios_to_process:
            self.manager.log("Already exists '%s' image file..." % self.name)
            return

        self.manager.log("Creating '%s' image file..." % self.name)

        # Process the sprite if necessary.
        self.process()

        # Create the sprite canvas
        width, height = self.canvas_size
        canvas = PImage.new('RGBA', (width, height), (0, 0, 0, 0))

        # Paste the images inside the canvas
        margin = int(self.config.margin)
        for image in self.images:
            canvas.paste(image.image,
                (round_up(image.x + (image.padding[3] + margin) * self.max_ratio),
                 round_up(image.y + (image.padding[0] + margin) * self.max_ratio)))

        meta = PngImagePlugin.PngInfo()
        meta.add_text('Software', 'glue-%s' % __version__)
        meta.add_text('Comment', self.hash)

        # Customize how the png is going to be saved
        kwargs = dict(optimize=False, pnginfo=meta)

        if self.config.png8:
            # Get the alpha band
            alpha = canvas.split()[-1]
            canvas = canvas.convert('RGB'
                        ).convert('P',
                                  palette=PImage.ADAPTIVE,
                                  colors=255)

            # Set all pixel values below 128 to 255, and the rest to 0
            mask = PImage.eval(alpha, lambda a: 255 if a <= 128 else 0)

            # Paste the color of index 255 and use alpha as a mask
            canvas.paste(255, mask)
            kwargs.update({'transparency': 255})

        # Loop all over the ratios and save one image for each one
        for ratio in ratios_to_process:
            sprite_image_path = self.image_path(ratio)

            save_full_size = lambda: canvas.save(sprite_image_path, **kwargs)

            # If this canvas isn't the biggest one scale it using the ratio
            if self.max_ratio != ratio:

                def pil_save():
                    reduced_canvas = canvas.resize(
                            (round_up((width / self.max_ratio) * ratio),
                             round_up((height / self.max_ratio) * ratio)),
                            PImage.ANTIALIAS)
                    reduced_canvas.save(sprite_image_path, **kwargs)

                if self.config.imagemagick:
                    def save():
                        save_full_size()
                        data = {'path': sprite_image_path,
                                'imagemagickpath': self.config.imagemagickpath,
                                'ratio': (100.0 / self.max_ratio) * ratio}
                        command = ["%(imagemagickpath)s %(path)s -resize %(ratio)s%% %(path)s" % data]
                        error = subprocess.call(command,
                                                shell=True,
                                                stdin=subprocess.PIPE,
                                                stdout=subprocess.PIPE)
                        if error:
                            self.manager.log("Error: ImageMagic has failed, using Pillow to scale the sprite.")
                            pil_save()
                else:
                    save = pil_save
            else:
                save = save_full_size

            save()

            # Optimize the image using optipng, if for some reason, it fails
            # rollback to the original one.
            if self.config.optipng:
                command = ["%s %s" % (self.config.optipngpath,
                                      sprite_image_path)]
                error = subprocess.call(command,
                                        shell=True,
                                        stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE)
                if error:
                    self.manager.log("Error: optipng has failed, reverting to "
                                     "the original file.")
                    save()

    def save_css(self):
        """Create the CSS or LESS file for this sprite."""

        if self.config.no_css:
            return

        format = 'less' if self.config.less else 'css'
        output_path = self.manager.output_path('css')
        filename = '%s.%s' % (self.filename, format)
        css_filename = os.path.join(output_path, filename)
        hash_line = '/* glue: %s hash: %s */\n' % (__version__, self.hash)

        # Check if the CSS file already exists and has the same hash
        try:
            assert not self.config.force
            with open(css_filename, 'r') as existing_css:
                first_line = existing_css.readline()
                assert first_line == hash_line
                self.manager.log("Already exists '%s' %s file..." % (self.name, format))
                return
        except Exception:
            pass

        self.manager.log("Creating '%s' %s file..." % (self.name, format))

        # Process the sprite if necessary.
        self.process()

        css_file = open(css_filename, 'w')

        # Write the hash line to the file.
        css_file.write(hash_line)

        # Get all the class names
        class_names = ['.%s' % i.class_name for i in self.images]

        # Exclude pseudo classes if the class is already in the list
        class_names = [cn for cn in class_names if ':' not in cn or cn.rsplit(':')[0] not in class_names]

        # Join class names
        class_names = ',\n'.join(class_names)

        # add the global style for all the sprites for less bloat
        template = self.config.global_template.decode('unicode-escape')
        css_file.write(template % {'all_classes': class_names,
                                   'sprite_url': self.image_url()})

        # compile one template for each file
        margin = int(self.config.margin)

        for image in self.images:

            x = '%spx' % round_up((image.x * -1 - margin * self.max_ratio) / self.max_ratio)
            y = '%spx' % round_up((image.y * -1 - margin * self.max_ratio) / self.max_ratio)

            height = '%spx' % round_up((image.height / self.max_ratio) + image.vertical_padding)
            width = '%spx' % round_up((image.width / self.max_ratio) + image.horizontal_padding)

            template = self.config.each_template.decode('unicode-escape')
            css_file.write(template % {'class_name': '.%s' % image.class_name,
                                       'identifier': image.class_name,
                                       'sprite_url': self.image_url(),
                                       'height': height,
                                       'width': width,
                                       'y': y,
                                       'x': x})

        # If we have some additional ratio, we need to add one media query
        # for each one.
        if len(self.ratios) > 1:
            canvas_size = zip(('width', 'height'),
                              map(lambda s: '%spx' % int(s / self.max_ratio),
                                  self.canvas_size))

            for ratio in self.ratios:
                if ratio != 1:
                    data = dict(ratio=ratio,
                                ratio_fraction=nearest_fration(ratio),
                                sprite_url=self.image_url(ratio),
                                all_classes=class_names,
                                **dict(canvas_size))
                    css_file.write(self.config.ratio_template % data)
        css_file.close()

    def save_html(self):
        """Create the HTML file for this sprite."""
        self.manager.log("Creating '%s' html file..." % self.name)

        output_path = self.manager.output_path('css')
        filename = '%s.html' % self.filename
        html_filename = os.path.join(output_path, filename)

        # CSS output format
        format = 'less' if self.config.less else 'css'

        html_file = open(html_filename, 'w')

        # get all the class names and join them
        class_names = [i.class_name for i in self.images \
                                                if ':' not in i.class_name]

        sprite_template = TEST_HTML_SPRITE_TEMPLATE.decode('unicode-escape')
        sprites_html = [sprite_template % {'class_name':c} for c in class_names]

        file_template = TEST_HTML_TEMPLATE.decode('unicode-escape')
        html_file.write(file_template % {'sprites': ''.join(sprites_html),
                                         'css_url': '%s.%s' % (self.filename, format),
                                         'version': __version__})
        html_file.close()

    @cached_property
    def filename(self):
        """Return the desired filename for files generated by this sprite."""
        if self.config.cachebuster_filename:
            return '%s_%s' % (self.name, self.hash[:6])
        return self.name

    def image_path(self, ratio=1, full=True):
        reference = self.__get_reference(ratio)
        """Return the output path for the image file.
        If full, prepend the img output path, if not only return the filename.
        :param ratio: Ratio.
        """
        filename = '%s%s.png' % (self.filename, reference)
        if full:
            return os.path.join(self.manager.output_path('img'), filename)
        return filename

    def __get_reference(self, ratio):
        """ Return the reference @Nx for this ratio.

        :param ratio: Ratio.
        """
        reference = '@%.1fx' % ratio if int(ratio) != ratio else '@%ix' % ratio
        if reference == '@1x':
            reference = ''
        return reference

    @cached_property
    def max_ratio(self):
        """ Return the maximum ratio """
        return max(self.ratios)

    def image_url(self, ratio=1):
        """Return the sprite image url.

        :param ratio: Ratio.
        """

        if self.config.url:
            image_path = self.image_path(ratio, full=False)
            url = os.path.join(self.config.url, image_path)
        else:
            image_path = self.image_path(ratio)
            url = os.path.relpath(image_path, self.manager.output_path('css'))
            url = os.path.normpath(url)

        # Fix css urls on Windows
        if os.name == 'nt':
            url = url.replace('\\', '/')

        if self.config.cachebuster:
            url = "%s?%s" % (url, self.hash[:6])

        return url

    @cached_property
    def hash(self):
        """ Return a hash of this sprite. In order to detect any change on
        the source images  it use the data, order and path of each image.
        In the same way it use this sprite settings as part of the hash.
        """
        hash_list = []
        for image in sorted(self.images, key=lambda i: i.path):
            hash_list.append(image.path)
            hash_list.append(image._data)

        for key in DEFAULT_SETTINGS:

            # Ignore this settings as they don't change the result.
            if key in ['html', 'quiet', 'force']:
                continue

            hash_list.append(key)
            hash_list.append(str(getattr(self.config, key)))

        return hashlib.sha1(''.join(hash_list)).hexdigest()[:10]


class ConfigManager(object):
    """Manage all the available configuration.

    If no config is available, return the default one."""

    def __init__(self, *args, **kwargs):
        """ConfigManager constructor.

        :param *args: List of config dictionaries. The order of this list is
                      important because as soon as a config property
                      is available it will be returned.
        :param defaults: Dictionary with the default configuration.
        :param priority: Dictionary with the command line configuration. This
                         configuration will override any other from any source.
        """
        self.defaults = kwargs.get('defaults', {})
        self.priority = kwargs.get('priority', {})
        self.sources = list(args)
        self._cache = {}

    def extend(self, config):
        """Return a new :class:`~ConfigManager` instance with this new config
                         inside the sources list.

        :param config: Dictionary with the new config.
        """
        return self.__class__(config, priority=self.priority,
                              defaults=self.defaults, *self.sources)

    def __getattr__(self, name):
        """Return the first available configuration value for this key. This
        method always prioritizes the command line configuration. If this key
        is not available within any configuration dictionary, it returns the
        default value

        :param name: Configuration property name.
        """
        if name in self._cache:
            return self._cache[name]

        try:
            value = super(ConfigManager, self).__getattribute__('_%s' % name)()
            self._cache[name] = value
            return value
        except AttributeError:
            pass

        self._cache[name] = self.find(name)

        return self._cache[name]

    @cached_property
    def _sources(self):
        return [self.priority] + self.sources

    def find(self, name):
        for source in self._sources:
            value = source.get(name)
            if value is not None:
                return value
        return self.defaults.get(name)


class BaseManager(object):

    def __init__(self, path, config, output=None):
        """BaseManager constructor.

        :param path: Sprite path.
        :param config: :class:`~ConfigManager` instance with all the
                       configuration for this sprite.
        :param output: output dir.
        """
        self.path = path
        self.config = config
        self.output = output
        self.sprites = []

    def process_sprite(self, path, name):
        """Create a new Sprite using this path and name and append it to the
        sprites list.

        :param path: Sprite path.
        :param name: Sprite name.
        """
        sprite = Sprite(name=name, path=path, manager=self)
        self.sprites.append(sprite)

    def validate(self):
        """Validate CSS class names collision between sprites"""

        class_names = reduce(lambda x, y: x + y, [[i.class_name for i in sprite.images] for sprite in self.sprites])

        if len(class_names) != len(set(class_names)):
            dup = [[i for i in sprite.images if class_names.count(i.class_name) > 1] for sprite in self.sprites]
            dup = reduce(lambda x, y: x + y, dup)
            raise MultipleImagesWithSameNameError(dup)

        return True

    def save(self):
        """Save all the sprites inside this manager."""

        # Validate sprites individualy
        for sprite in self.sprites:
            self.log("Processing '%s':" % sprite.name)
            sprite.validate()

        # Validate collisions between sprites
        self.validate()

        for sprite in self.sprites:
            sprite.save_image()
            sprite.save_css()
            if sprite.manager.config.html:
                sprite.save_html()

    def output_path(self, format):
        """Return the path where all the generated files will be saved.

        :param format: File format.
        """
        if format == 'css' and self.config.css_dir:
            sprite_output_path = self.config.css_dir
        elif format == 'img' and self.config.img_dir:
            sprite_output_path = self.config.img_dir
        else:
            sprite_output_path = self.output
        if not os.path.exists(sprite_output_path):
            os.makedirs(sprite_output_path)
        return sprite_output_path

    def log(self, message):
        """Print the message if necessary.

        :param message: Message to log.
        """
        if not self.config.quiet:
            print(message)

    def process(self):
        raise NotImplementedError()


class ProjectSpriteManager(BaseManager):

    def process(self):
        """Process a path searching for folders that contain images.
        Every folder will be a new sprite with all the images inside.

        The filename of the image can also contain information about the
        padding needed around the image.

        * ``filename.png`` will have the default padding (10px).
        * ``filename_20.png`` will have 20px all around the image.
        * ``filename_1-2-3.png`` will have 1px 2px 3px 2px around the image.
        * ``filename_1-2-3-4.png`` will have 1px 2px 3px 4px around the image.

        The generated CSS file will have a CSS class for every image found
        inside the sprites folder. These CSS class names will have the
        following format:

        ``.[namespace]-[sprite_name]-[image_name]{ ... }``

        The image_name will only contain alphanumeric characters,
        ``-`` and ``_``. The default namespace is ``sprite``, but it could be
        overridden using the ``--namespace`` optional argument.


        * ``animals/cat.png`` CSS class will be ``.sprite-animals-cat``
        * ``animals/cow_20.png`` CSS class will be ``.sprite-animals-cow``

        If two images have the same name,
        :class:`~MultipleImagesWithSameNameError` will be raised.

        This is not the default manager. It is only used if you use
        the ``--project`` argument.
        """

        for sprite_name in sorted(os.listdir(self.path)):

            # Only process folders
            path = os.path.join(self.path, sprite_name)

            # Ignore folders starting with '.'
            if sprite_name.startswith('.'):
                continue

            # Ignore symlinks if necessary.
            if os.path.isdir(path) or (os.path.islink(path) and self.config.follow_links):
                self.process_sprite(path=path, name=sprite_name)

        if not self.sprites:
            raise NoSpritesFoldersFoundError(self.path)

        self.save()


class SimpleSpriteManager(BaseManager):

    def process(self):
        """Process a single folder and create one sprite. It works the
        same way as :class:`~ProjectSpriteManager`, but only for one folder.

        This is the default manager.
        """
        self.process_sprite(path=self.path, name=os.path.basename(self.path))
        self.save()


class WatchManager(object):
    """ Watch a path for changes. """

    def __init__(self, path, action):
        """
        :param path: Path to watch.
        :param action: Action to run when a change happens.
        """
        self.action = action
        self.path = path
        self.last_hash = None

    def run(self):
        """ Start watching the path for changes """
        signal.signal(signal.SIGINT, self.signal_handler)

        while True:
            try:
                current_hash = self.generate_hash()
                if self.last_hash != current_hash:
                    self.action()
                self.last_hash = current_hash
            except Exception:
                pass
            finally:
                time.sleep(0.2)

    def signal_handler(self, signal, frame):
        """ Gracefully close the app if Ctrl+C is pressed."""
        print 'You pressed Ctrl+C!'
        sys.exit(0)

    def generate_hash(self):
        """ Return a hash of files and modification times to determine if a
        change has occourred."""

        hash_list = []
        for root, dirs, files in os.walk(self.path):
            for f in sorted([f for f in files if not f.startswith('.')]):
                hash_list.append(os.path.join(root, f))
                hash_list.append(str(os.path.getmtime(os.path.join(root, f))))
        hash_list = ''.join(hash_list)
        return hashlib.sha1(hash_list).hexdigest()


def get_file_config(path, section='sprite'):
    """Return, as a dictionary, all the available configuration inside the
    sprite configuration file on this path.

    :param path: Path where the configuration file is.
    :param section: The configuration file section that needs to be read.
    """
    def clean(value):
        return {'true': True, 'false': False}.get(value.lower(), value)

    config = ConfigParser.RawConfigParser()
    config.read(os.path.join(path, CONFIG_FILENAME))
    try:
        keys = config.options(section)
    except ConfigParser.NoSectionError:
        return {}
    return dict([[k, clean(config.get(section, k))] for k in keys])


def command_exists(command):
    """Check if a command exists by running it.

    :param command: command name.
    """
    try:
        subprocess.check_call([command], shell=True, stdin=subprocess.PIPE,
                              stderr=subprocess.PIPE, stdout=subprocess.PIPE)
    except subprocess.CalledProcessError:
        return False
    return True


#########################################################################
# PIL currently doesn't support full alpha for PNG8 so it's necessary to
# monkey patch PIL to support them.
# http://mail.python.org/pipermail/image-sig/2010-October/006533.html
#########################################################################

try:
    from PIL import ImageFile, PngImagePlugin
except:
    import ImageFile, PngImagePlugin

def patched_chunk_tRNS(self, pos, len):
    i16 = PngImagePlugin.i16
    s = ImageFile._safe_read(self.fp, len)
    if self.im_mode == "P":
        self.im_info["transparency"] = map(ord, s)
    elif self.im_mode == "L":
        self.im_info["transparency"] = i16(s)
    elif self.im_mode == "RGB":
        self.im_info["transparency"] = i16(s), i16(s[2:]), i16(s[4:])
    return s
PngImagePlugin.PngStream.chunk_tRNS = patched_chunk_tRNS


def patched_load(self):
    if self.im and self.palette and self.palette.dirty:
        apply(self.im.putpalette, self.palette.getdata())
        self.palette.dirty = 0
        self.palette.rawmode = None
        try:
            trans = self.info["transparency"]
        except KeyError:
            self.palette.mode = "RGB"
        else:
            try:
                for i, a in enumerate(trans):
                    self.im.putpalettealpha(i, a)
            except TypeError:
                self.im.putpalettealpha(trans, 0)
            self.palette.mode = "RGBA"
    if self.im:
        return self.im.pixel_access(self.readonly)
PImage.Image.load = patched_load
#########################################################################


def main():
    parser = OptionParser(usage=("usage: %prog [options] source_dir [<output> "
                                 "| --css=<dir> --img=<dir>]"))
    parser.add_option("--project", action="store_true", dest="project",
            help="generate sprites for multiple folders")
    parser.add_option("-r", "--recursive", dest="recursive", action='store_true',
            help=("Read directories recursively and add all the "
                  "images to the same sprite."))
    parser.add_option("--follow-links", dest="follow_links", action='store_true',
            help="Follow symbolic links.")
    parser.add_option("-c", "--crop", dest="crop", action='store_true',
            help="crop images removing unnecessary transparent margins")
    parser.add_option("-l", "--less", dest="less", action='store_true',
            help="generate output stylesheets as .less instead of .css")
    parser.add_option("-u", "--url", dest="url",
            help="prepend this url to the sprites filename")
    parser.add_option("-q", "--quiet", dest="quiet", action='store_true',
            help="suppress all normal output")
    parser.add_option("-p", "--padding", dest="padding",
            help="force this padding in all images")
    parser.add_option("--ratios", dest="ratios",
            help="Create sprites based on these ratios")
    parser.add_option("--retina", dest="retina", action='store_true',
            help="Shortcut for --ratios=2,1")
    parser.add_option("-f", "--force", dest="force", action='store_true',
            help=("force glue to create every sprite and CSS file even if "
                  "they already exists in the output directory."))
    parser.add_option("-w", "--watch", dest="watch", default=False,
            action='store_true',
            help=("Watch the source folder for changes and rebuild "
                  "when new files appear, disappear or change."))
    parser.add_option("-v", "--version", action="store_true", dest="version",
            help="show program's version number and exit")

    group = OptionGroup(parser, "Output Options")
    group.add_option("--css", dest="css_dir", default='', metavar='DIR',
            help="output directory for css files")
    group.add_option("--img", dest="img_dir", default='', metavar='DIR',
            help="output directory for img files")
    group.add_option("--html", dest="html", action="store_true",
            help="generate test html file using the sprite image and CSS.")
    group.add_option("--no-css", dest="no_css", action="store_true",
            help="don't genereate CSS files.")
    group.add_option("--no-img", dest="no_img", action="store_true",
            help="don't genereate IMG files.")

    parser.add_option_group(group)

    group = OptionGroup(parser, "Advanced Options")
    group.add_option("-a", "--algorithm", dest="algorithm", metavar='NAME',
            help=("allocation algorithm: square, vertical, horizontal, "
                  "vertical-right, horizontal-bottom, diagonal. "
                  "(default: square)"))
    group.add_option("--ordering", dest="ordering", metavar='NAME',
            help=("ordering criteria: maxside, width, height or "
                  "area (default: maxside)"))
    group.add_option("--margin", dest="margin", type=int,
            help="force this margin in all images")
    group.add_option("--namespace", dest="namespace",
            help="namespace for all css classes (default: sprite)")
    group.add_option("--sprite-namespace", dest="sprite_namespace",
            help="namespace for all sprites (default: sprite name)")
    group.add_option("--png8", action="store_true", dest="png8",
            help="the output image format will be png8 instead of png32")
    group.add_option("--ignore-filename-paddings", action='store_true',
            dest="ignore_filename_paddings", help="ignore filename paddings")
    group.add_option("--debug", dest="debug", action='store_true',
            help="don't catch unexpected errors and let glue fail hardly")
    parser.add_option_group(group)

    group = OptionGroup(parser, "Output CSS Template Options")
    group.add_option("--separator", dest="separator", metavar='SEPARATOR',
            help=("Customize the separator used to join CSS class "
                  "names. If you want to use camelCase use "
                  "'camelcase' as separator."))
    group.add_option("--global-template", dest="global_template",
            metavar='TEMPLATE',
            help=("Customize the global section of the output CSS."
                  "This section will be added only once for each "
                  "sprite."))
    group.add_option("--each-template", dest="each_template",
            metavar='TEMPLATE',
            help=("Customize each image output CSS."
                  "This section will be added once for each "
                  "image inside the sprite."))
    group.add_option("--ratio-template", dest="ratio_template",
            metavar='TEMPLATE',
            help=("Customize ratios CSS media queries template."
                  "This section will be added once for each "
                  "ratio different than 1."))
    parser.add_option_group(group)

    group = OptionGroup(parser, "Optipng Options",
                "You need to install optipng before using these options")
    group.add_option("--optipng", dest="optipng", action='store_true',
            help="postprocess images using optipng")
    group.add_option("--optipngpath", dest="optipngpath",
            help="path to optipng (default: optipng)", metavar='PATH')
    parser.add_option_group(group)

    group = OptionGroup(parser, "ImageMagick Options",
                "You need to install ImageMagick before using these options")
    group.add_option("--imagemagick", dest="imagemagick", action='store_true',
            help="Use ImageMagick to scale down retina sprites instead of Pillow.")
    group.add_option("--imagemagickpath", dest="imagemagickpath",
            help="path to imagemagick (default: convert)", metavar='PATH')
    parser.add_option_group(group)

    group = OptionGroup(parser, "Browser Cache Invalidation Options")
    group.add_option("--cachebuster", dest="cachebuster", action='store_true',
            help=("use the sprite's sha1 first 6 characters as a "
                  "queryarg everytime that file is referred from the css"))
    group.add_option("--cachebuster-filename", dest="cachebuster_filename",
            action='store_true',
            help=("append the sprite's sha first 6 characters "
                  "to the otput filename"))
    parser.add_option_group(group)

    (options, args) = parser.parse_args()

    if options.version:
        sys.stdout.write("%s\n" % __version__)
        sys.exit(0)

    if options.cachebuster and options.cachebuster_filename:
        parser.error("You can't use --cachebuster and "
                     "--cachebuster-filename at the same time.")

    if not len(args):
        parser.error("You must provide the folder containing the sprites.")

    if len(args) == 1 and not (options.css_dir and options.img_dir):
        parser.error(("You must choose the output folder using either the "
                      "output argument or both --img and --css."))

    if len(args) == 2 and (options.css_dir or options.img_dir):
        parser.error(("You must choose between using an unique output dir, or "
                      "using --css and --img."))

    source = os.path.abspath(args[0])
    output = os.path.abspath(args[1]) if len(args) == 2 else None

    if not os.path.isdir(source):
        parser.error("Directory not found: '%s'" % source)

    if options.project:
        manager_cls = ProjectSpriteManager
    else:
        manager_cls = SimpleSpriteManager

    # Get configuration from file
    config = get_file_config(source)

    # Convert options to dict
    options = options.__dict__

    config = ConfigManager(config, priority=options, defaults=DEFAULT_SETTINGS)

    manager = manager_cls(path=source, output=output, config=config)

    if config.optipng and not command_exists(config.optipngpath):
        parser.error("'optipng' seems to be unavailable. You need to "
                     "install it before using --optipng, or "
                     "provide a path using --optipngpath.")

    if manager.config.watch:
        WatchManager(path=source, action=manager.process).run()
        sys.exit(0)

    try:
        manager.process()
    except MultipleImagesWithSameNameError, e:
        sys.stderr.write("Error: Some images will have the same class name:\n")
        for image in e.args[0]:
            rel_path = os.path.relpath(image.path)
            sys.stderr.write('\t%s => .%s\n' % (rel_path, image.class_name))
        sys.exit(e.error_code)
    except SourceImagesNotFoundError, e:
        sys.stderr.write("Error: No images found in %s.\n" % e.args[0])
        sys.exit(e.error_code)
    except NoSpritesFoldersFoundError, e:
        sys.stderr.write("Error: No sprites folders found in %s.\n" % e.args[0])
        sys.exit(e.error_code)
    except InvalidImageOrderingError, e:
        sys.stderr.write("Error: Invalid image ordering %s.\n" % e.args[0])
        sys.exit(e.error_code)
    except InvalidImageAlgorithmError, e:
        sys.stderr.write("Error: Invalid image algorithm %s.\n" % e.args[0])
        sys.exit(e.error_code)
    except PILUnavailableError, e:
        sys.stderr.write(("Error: PIL %s decoder is unavailable"
                          "Please read the documentation and "
                          "install it before spriting this kind of "
                          "images.\n") % e.args[0])
        sys.exit(e.error_code)
    except Exception:
        if config.debug:
            import platform
            sys.stderr.write("Glue version: %s\n" % __version__)
            sys.stderr.write("PIL version: %s\n" % PImage.VERSION)
            sys.stderr.write("Platform: %s\n" % platform.platform())
            sys.stderr.write("Config: %s\n" % config.sources)
            sys.stderr.write("Args: %s\n" % sys.argv)
            sys.stderr.write("\n")

        sys.stderr.write("Error: Unknown Error.\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
