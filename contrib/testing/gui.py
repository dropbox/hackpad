#!/usr/bin/env python
# -*- coding: utf-8 -*-

from Tkinter import *
import Image
import ImageTk
import os
import shutil

# Set constants.
current_dir = os.path.dirname(os.path.realpath(__file__))
screenshots_dir = os.path.join(current_dir, 'screenshots')
screenshots_reference_dir = os.path.join(screenshots_dir, 'reference')
screenshots_results_dir = os.path.join(screenshots_dir, 'results')
screenshots_diffs_dir = os.path.join(screenshots_dir, 'diffs')
global_cfg_path = os.path.join(current_dir, 'global.cfg')


class Application:
  def __init__(self, master):
    self.width = 1024
    self.height = 768
    self.index = 0
    self.text1 = None
    self.diff_images = []
    self.frame = None
    self.master = master
    self.image_type = 1   # 0 == ref, 1 == result, 2 == diffs

    for f in os.walk(screenshots_diffs_dir):
      for filename in f[2]:
        if os.path.splitext(filename)[1] != '.png':
          continue
        self.diff_images.append(os.path.join(f[0], filename))

    self.frame = Frame(master)
    self.frame.pack(side='top', expand=1, fill='x')
    self.master.bind('<Up>', self.rotate_image_up)
    self.master.bind('<Down>', self.rotate_image_down)
    self.master.bind('<Left>', self.prev_image)
    self.master.bind('<Right>', self.next_image)

    if len(self.diff_images):
      self.createWidgets()
      self.draw_image()
    else:
      print 'All good!'
      self.master.destroy()

  def createWidgets(self):
    self.prev_btn = Button(self.frame, text="← prev", command=self.prev_image)
    self.prev_btn.grid(row=0)
    self.next_btn = Button(self.frame, text="next →", command=self.next_image)
    self.next_btn.grid(row=0, column=1)
    self.rotate_btn_up = Button(self.frame, text="↑ cycle up",
        command=self.rotate_image_up)
    self.rotate_btn_up.grid(row=0, column=2, padx=(30, 0))
    self.rotate_btn_down = Button(self.frame, text="cycle down ↓",
        command=self.rotate_image_down)
    self.rotate_btn_down.grid(row=0, column=3)
    self.ref = Button(self.frame, text="update ref.", command=self.update_ref)
    self.ref.grid(row=0, column=4, padx=30)
    self.type_lbl = Label(self.frame, text='')
    self.type_lbl.grid(row=0, column=5, padx=30)
    self.update_button_states()

  def draw_image(self):
    reference_path, result_path, diff_path = self.get_paths()
    file_path = diff_path
    if self.image_type == 0:
      file_path = reference_path
    elif self.image_type == 1:
      file_path = result_path

    browser_name = os.path.basename(os.path.dirname(file_path))
    test_name = os.path.splitext(os.path.basename(file_path))[0]
    self.master.title(browser_name + ': ' + test_name)

    try:
      image = Image.open(file_path)
    except:
      return
    self.tkimage = ImageTk.PhotoImage(image)
    if self.text1:
      self.text1.pack_forget()
      self.scroll.pack_forget()
    self.text1 = Text(root, width=1000, height=800)
    self.scroll = Scrollbar(self.master, command=self.text1.yview)
    self.tkimage = ImageTk.PhotoImage(image)
    self.text1.insert(END,'\n')
    self.text1.image_create(END, image=self.tkimage)
    self.scroll.pack(side=RIGHT, fill=Y)
    self.text1.pack(side=LEFT)

  def update_button_states(self):
    reference_path, result_path, diff_path = self.get_paths()

    self.prev_btn.config(state = NORMAL
        if self.index > 0 else DISABLED)
    self.next_btn.config(state = NORMAL
        if self.index < len(self.diff_images) - 1 else DISABLED)
    self.ref.config(state = NORMAL
        if os.path.exists(diff_path) else DISABLED)

    self.ref['text'] = 'Update ref.' if os.path.exists(diff_path) else 'updated'
    if self.image_type == 0:
      self.type_lbl['text'] = 'reference'
    elif self.image_type == 1:
      self.type_lbl['text'] = 'result'
    elif self.image_type == 2:
      self.type_lbl['text'] = 'diff'

  def prev_image(self, event=None):
    self.index = max(0, self.index - 1)
    self.draw_image()
    self.update_button_states()

  def next_image(self, event=None):
    self.index = min(len(self.diff_images) - 1, self.index + 1)
    self.draw_image()
    self.update_button_states()

  def rotate_image_up(self, event=None):
    self.image_type = (self.image_type - 1) % 3
    self.draw_image()
    self.update_button_states()

  def rotate_image_down(self, event=None):
    self.image_type = (self.image_type + 1) % 3
    self.draw_image()
    self.update_button_states()

  def get_paths(self):
    diff_path = self.diff_images[self.index]
    filename = os.path.basename(diff_path)
    diff_parent_dir = os.path.basename(os.path.dirname(diff_path))
    reference_file_dir = os.path.join(screenshots_reference_dir,
        diff_parent_dir)
    reference_path = os.path.join(reference_file_dir, filename)
    result_file_dir = os.path.join(screenshots_results_dir, diff_parent_dir)
    result_path = os.path.join(result_file_dir, filename)

    return reference_path, result_path, diff_path

  def update_ref(self):
    reference_path, result_path, diff_path = self.get_paths()
    shutil.copyfile(result_path, reference_path)
    os.remove(diff_path)
    self.update_button_states()

root = Tk()
app = Application(root)
root.mainloop()
