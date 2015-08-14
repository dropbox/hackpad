#!/usr/bin/env python

import ConfigParser
import os
import shutil
import sys
import wand.api
import ctypes
import argparse

# Set constants.
current_dir = os.path.dirname(os.path.realpath(__file__))
screenshots_dir = os.path.join(current_dir, 'screenshots')
screenshots_reference_dir = os.path.join(screenshots_dir, 'reference')
screenshots_results_dir = os.path.join(screenshots_dir, 'results')
screenshots_diffs_dir = os.path.join(screenshots_dir, 'diffs')
global_cfg_path = os.path.join(current_dir, 'global.cfg')

# Clear previous diffs.
if os.path.exists(screenshots_diffs_dir):
  shutil.rmtree(screenshots_diffs_dir)

# Read global config.
global_config = ConfigParser.ConfigParser()
global_config.read(global_cfg_path)
image_diff_percentage = float(global_config.get('general',
    'image_diff_percentage'))

# Colors.
blue = '\033[94m'
green = '\033[92m'
orange = '\033[33m'
red = '\033[91m'
end_color = '\033[0m'

parser = argparse.ArgumentParser(description='Compare screenshot results!')
parser.add_argument('--nogui', action='store_true', default=False, help='show results as pass/fail in stdout')
parser.add_argument('--nocolors', action='store_true', default=False,
    help='no color formatting of stdout')

args = parser.parse_args()

skip_gui = args.nogui

if args.nocolors:
  blue = green = orange = red = end_color = ''

# Setup ImageMagick ctypes interface.
wand_lib = wand.api.library
wand_lib.MagickReadImage.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
wand_lib.MagickCompareImages.restype = ctypes.c_void_p
wand_lib.MagickCompareImages.argtypes = [ctypes.c_void_p, ctypes.c_void_p,
    ctypes.c_int, ctypes.c_void_p]
wand_lib.MagickWriteImage.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
wand_lib.DestroyMagickWand.argtypes = [ctypes.c_void_p]

wand_lib.MagickWandGenesis()

for f in os.walk(screenshots_results_dir):
  for filename in f[2]:
    if os.path.splitext(filename)[1] != '.png':
      continue

    result_path = os.path.join(f[0], filename)
    result_parent_dir = os.path.basename(os.path.dirname(result_path))
    reference_file_dir = os.path.join(screenshots_reference_dir,
        result_parent_dir)
    reference_path = os.path.join(reference_file_dir, filename)
    diff_file_dir = os.path.join(screenshots_diffs_dir, result_parent_dir)
    diff_path = os.path.join(diff_file_dir, filename)
    if not os.path.exists(reference_file_dir):
      os.makedirs(reference_file_dir)

    test_result = 'PASSED'

    if not os.path.exists(reference_path):
      print blue + os.path.basename(os.path.dirname(reference_path)) + ': ' + \
          orange + os.path.basename(reference_path) + end_color
      # If file doesn't exist, it's the reference file automatically.
      shutil.copyfile(result_path, reference_path)
    else:
      # Read images.
      reference = wand_lib.NewMagickWand()
      wand_lib.MagickReadImage(reference, reference_path)
      result = wand_lib.NewMagickWand()
      wand_lib.MagickReadImage(result, result_path)

      # Compare.
      distortion = ctypes.c_double()
      # 5 == Peak Absolute Error: http://www.imagemagick.org/api/MagickCore/compare_8h.html
      comparison = wand_lib.MagickCompareImages(reference, result, 5,
          ctypes.byref(distortion))

      if not os.path.exists(diff_file_dir):
        os.makedirs(diff_file_dir)

      if comparison:
        # Write out comparison file if needed.
        if distortion.value > image_diff_percentage:
          wand_lib.MagickWriteImage(comparison, diff_path)
          test_result = 'FAILED'
      else:
        test_result = 'FAILED (SIZE MISMATCH)'
        print >> sys.stderr, red + \
            'Error! Non-matching image size to reference: ' + \
            result_path + end_color
        shutil.copyfile(result_path, diff_path)

      # Clean up.
      wand_lib.DestroyMagickWand(reference)
      wand_lib.DestroyMagickWand(result)
      if comparison:
        wand_lib.DestroyMagickWand(comparison)

      show_value = test_result != 'FAILED (SIZE MISMATCH)'

      print "{blue}{config}: {orange}{test_image}{end_color}: {distortion} {pass_or_fail}".format(
        blue=blue,
        orange=orange,
        config=os.path.basename(os.path.dirname(reference_path)),
        test_image=os.path.basename(reference_path),
        end_color=end_color,
        distortion=str(distortion.value) if show_value else "",
        pass_or_fail=(green if test_result == 'PASSED' else red) + test_result + end_color)

wand_lib.MagickWandTerminus()

if not skip_gui:
  os.system("./gui.py")
