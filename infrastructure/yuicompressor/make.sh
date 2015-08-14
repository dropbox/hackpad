#!/bin/bash

#  Copyright 2009 Google Inc.
#  
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  
#       http://www.apache.org/licenses/LICENSE-2.0
#  
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS-IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

mkdir -p build
(
    cd build
    find ../lib -name '*.jar' | xargs -n1 jar xf
    rm -rf META-INF
    cd ..
    javac -d build -classpath lib/jargs-1.0.jar:lib/rhino-yuicompressor.jar `find src -name '*.java'`
    cd build
    jar cf ../../lib/yuicompressor-2.4-appjet.jar *
)
rm -rf build
