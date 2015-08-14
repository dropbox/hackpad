try:
    from setuptools import setup
    kw = {'entry_points':
          """[console_scripts]\nglue = glue:main\n""",
          'zip_safe': False}
except ImportError:
    from distutils.core import setup
    kw = {'scripts': ['glue.py']}

setup(
    name='glue',
    version='0.3',
    url='http://github.com/jorgebastida/glue',
    license='BSD',
    author='Jorge Bastida',
    author_email='me@jorgebastida.com',
    description='Glue is a simple command line tool to generate CSS sprites.',
    long_description=('Glue is a simple command line tool to generate CSS '
                      'sprites using any kind of source images like '
                      'PNG, JPEG or GIF. Glue will generate a unique PNG '
                      'file containing every source image and a CSS file '
                      'including the necessary CSS classes to use the '
                      'sprite.'),
    py_modules=['glue'],
    platforms='any',
    install_requires=[
        'Pillow==1.7.8'
    ],
    classifiers=[
        'Development Status :: 4 - Beta',
        'Environment :: Web Environment',
        'Intended Audience :: Developers',
        'License :: OSI Approved :: BSD License',
        'Operating System :: OS Independent',
        'Programming Language :: Python',
        'Topic :: Utilities'
    ],
    **kw
)
