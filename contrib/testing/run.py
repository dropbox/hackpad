#!/usr/bin/env python

import ConfigParser
import Image
import datetime
import os
import shutil
import subprocess
import argparse
import sys
import time
from multiprocessing import Pool
from selenium import webdriver
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities

# Set constants.
mobile_browsers = ['iPad', 'iPhone', 'android']
current_dir = os.path.dirname(os.path.realpath(__file__))
jslib_dir = os.path.join(current_dir, 'lib')
tests_dir = os.path.join(current_dir, 'tests')
screenshots_dir = os.path.join(current_dir, 'screenshots')
screenshots_results_dir = os.path.join(screenshots_dir, 'results')
global_cfg_path = os.path.join(current_dir, 'global.cfg')

# Clear previous screenshots.
if os.path.exists(screenshots_results_dir):
  shutil.rmtree(screenshots_results_dir)

# Retrieve js libraries.
bilite_js = file(os.path.join(jslib_dir, 'bililiteRange.js')).read()
sendkeys_js = file(os.path.join(jslib_dir, 'jquery.sendkeys.js')).read()
hackpad_js = file(os.path.join(jslib_dir, 'hackpad.js')).read()

# Read global config.
global_config = ConfigParser.ConfigParser()
global_config.read(global_cfg_path)
command_executor = global_config.get('general', 'command_executor')
global_browsers = global_config.get('general', 'browsers').split('\n')
global_project = global_config.get('general', 'project')
global_screen_resolution = global_config.get('general', 'screen_resolution')
global_browser_size = global_config.get('general', 'browser_size')
global_async = global_config.get('general', 'async') == 'true'
global_parallel_threads = int(global_config.get('general', 'parallel_threads'))
global_cookie_domain = global_config.get('general', 'cookie_domain')
global_cookie_login_domain = global_config.get('general', 'cookie_login_domain')
global_cookie_login_name = global_config.get('general', 'cookie_login_name')
global_cookie_login_value = global_config.get('general', 'cookie_login_value')

# Colors.
blue = '\033[94m'
orange = '\033[33m'
red = '\033[91m'
end_color = '\033[0m'

parser = argparse.ArgumentParser(description='Run screenshot tests!')
parser.add_argument('testfile', type=str, nargs='?',
                   help='a testfile to run')
parser.add_argument('test', metavar='test', type=str, nargs='?',
                   help='a particular test to run in the testfile')
parser.add_argument('-f', action='store_true', default=False,
    help='run full tests: run all of the browsers in global.cfg, not just the first')
parser.add_argument('--nogui', action='store_true', default=False,
    help='show results as pass/fail in stdout')
parser.add_argument('--nocolors', action='store_true', default=False,
    help='no color formatting of stdout')
args = parser.parse_args()

if args.nocolors:
  blue = green = orange = red = end_color = ''

# Remove test directory prefix.
if args.testfile:
  testdir_with_prefix = os.path.join('tests', '')
  args.testfile = args.testfile.replace(testdir_with_prefix, '')

test_list = [args.testfile] if args.testfile else os.listdir(tests_dir)

def run_test(driver, browser_size, cookie_domain, cookie_login_domain, cookie_login_name,
    cookie_login_value, config, browser, main_test, is_mobile):
  test_section = ''

  try:
    try:
      driver.set_window_position(0, 0)
      driver.set_window_size(int(browser_size[0]), int(browser_size[1]))
      driver.set_window_position(0, 0)
      #driver.window_maximize()
    except:
      # Android doesn't like maximize.
      pass

    if cookie_domain:
      driver.get(cookie_domain)
      driver.add_cookie({'domain': cookie_login_domain,
        'name': cookie_login_name,
        'expires': 2114380800000,
        'value': cookie_login_value})

    # Run every test for this browser.
    for section in config.sections():
      if section == 'general':
        continue
      if args.test and section != args.test:
        continue

      test_section = section
      print blue + browser + ': ' + orange + main_test + ': ' + end_color + \
          section + end_color

      # Retrieve test
      url = config.get(section, 'url')
      if config.has_option(section, 'js'):
        js = config.get(section, 'js')
      else:
        js = ''
      if config.has_option(section, 'wait'):
        wait = config.get(section, 'wait')
      else:
        wait = None

      # Run the test!
      driver.get(url)
      try:
        driver.execute_script(bilite_js + ';' + sendkeys_js + ';' +
            hackpad_js + ';' +
            '$.isReady ? (function() {' + js +'})() : $(function() {' + js + '});')
        if wait:
          driver.find_element_by_css_selector(wait)
      except:
        # If test fails, still take a screenshot of it.
        pass

      # Take a screenshot.
      time.sleep(3)
      test_result_dir = os.path.join(screenshots_results_dir, browser)
      if not os.path.exists(test_result_dir):
        os.makedirs(test_result_dir)
      screenshot_path = os.path.join(test_result_dir,
          main_test + '_' + section + '.png')
      driver.save_screenshot(screenshot_path)

      # Mobile browsers include the top notification bar as part of the
      # screenshot (carrier, wifi, current time, etc.)  This messes with
      # the screenshot diff later on so we crop it out here.
      # 25px does the trick for iPhone, 65px for iPad.
      if is_mobile:
        screenshot = Image.open(screenshot_path)
        crop_length = 65 if browser.find('iPad') != -1 else 25
        cropped_image = screenshot.crop((0, crop_length, screenshot.size[0],
            screenshot.size[1]))
        cropped_image.save(screenshot_path, 'png')
  except Exception as ex:
    print ex
    print >> sys.stderr, red + 'Error! Selenium failed completely: ' + \
        end_color + browser + ': ' + main_test + ': ' + test_section
    pass
  finally:
    driver.quit()

if global_async:
  pool = Pool(processes=global_parallel_threads)

for test in test_list:
  if os.path.splitext(test)[1] != '.cfg':
    continue

  main_test = os.path.splitext(test)[0]

  # Read tests.
  config = ConfigParser.ConfigParser()
  config.read(os.path.join(tests_dir, test))
  if config.has_option('general', 'browsers'):
    browsers = config.get('general', 'browsers').split('\n')
  else:
    browsers = global_browsers
  if config.has_option('general', 'browser_size'):
    browser_size = config.get('general', 'browser_size')
  else:
    browser_size = global_browser_size
  if config.has_option('general', 'cookie_domain'):
    cookie_domain = config.get('general', 'cookie_domain')
  else:
    cookie_domain = global_cookie_domain
  if config.has_option('general', 'cookie_login_domain'):
    cookie_login_domain = config.get('general', 'cookie_login_domain')
  else:
    cookie_login_domain = global_cookie_login_domain
  if config.has_option('general', 'cookie_login_name'):
    cookie_login_name = config.get('general', 'cookie_login_name')
  else:
    cookie_login_name = global_cookie_login_name
  if config.has_option('general', 'cookie_login_value'):
    cookie_login_value = config.get('general', 'cookie_login_value')
  else:
    cookie_login_value = global_cookie_login_value
  browser_size = browser_size.split('x')

  for browser in browsers:
    browser = browser.strip()
    browser_specs = browser.split('-')

    # Configure browser.
    is_mobile = False
    mobile_browser = None
    for mobile_browser_test in mobile_browsers:
      if browser_specs[2].lower().find(mobile_browser_test.lower()) != -1:
        is_mobile = True
        mobile_browser = mobile_browser_test
    caps = {}
    if is_mobile:
      caps['platform'] = browser_specs[0] + ' ' + browser_specs[1]
      caps['device'] = browser_specs[2] + ' Simulator'
      caps['app'] = 'safari'
      if len(browser_specs) > 3:
        caps['version'] = browser_specs[3]
    else:
      caps['platform'] = browser_specs[0] + ' ' + browser_specs[1]
      caps['os'] = browser_specs[0]
      caps['os_version'] = browser_specs[1]
      caps['browser'] = caps['browserName'] = browser_specs[2]
      caps['screenshot'] = True
      if len(browser_specs) > 3:
        caps['browser_version'] = caps['version'] = browser_specs[3]

    caps['project'] = global_project
    caps['screen-resolution'] = global_screen_resolution
    git_describe = subprocess.check_output(["git", "describe", "--always"])
    caps['build'] = git_describe
    caps['extra'] = git_describe
    caps['groups'] = git_describe
    caps['name'] = str(datetime.datetime.now())
    caps['ignoreProtectedModeSettings'] = 'true'
    caps['browserstack.debug'] = 'true'

    try:
      # Open browser.
      driver = webdriver.Remote(command_executor=command_executor,
          desired_capabilities=caps)
      driver.implicitly_wait(10)  # seconds

      if global_async:
        pool.apply_async(run_test, [driver, browser_size, cookie_domain,
            cookie_login_domain, cookie_login_name, cookie_login_value,
            config, browser, main_test, is_mobile])
      else:
        run_test(driver, browser_size, cookie_domain,
            cookie_login_domain, cookie_login_name, cookie_login_value,
            config, browser, main_test, is_mobile)
    except Exception as ex:
      print ex
      print >> sys.stderr, red + 'Error! Startup of selenium failed completely: ' + \
          end_color + browser + ': ' + main_test
      try:
        driver.quit()
      except:
        pass
      pass

    # Run smoke test - just one browser.
    if not args.f:
      break

if global_async:
  pool.close()

cmd = "./compare.py"
if args.nogui:
  cmd += " --nogui"
if args.nocolors:
  cmd += " --nocolors"

os.system(cmd)
