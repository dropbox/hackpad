#! /bin/bash

################################################################################
#
# Copyright (c) 2010 penSec.IT UG (haftungsbeschränkt)
#        http://www.pensec.it
#        mail@pensec.it
# Copyright (c) 2010 Egil Möller <egil.moller@piratpartiet.se>
# Copyright (c) 2010 Mikko Rantalainen <mikko.rantalainen@peda.net>
# 
# Licensed under the Apache License, Version 2.0 (the "License"); you may not
# use this file except in compliance with the License. You may obtain a copy of
# the License at
# 
#        http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
# WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
# License for the specific language governing permissions and limitations under
# the License. 
#
################################################################################

ETHERPADDIR="$(cd "$(dirname "$0")/.."; pwd)"
source "$ETHERPADDIR/bin/exports.sh"


PID_FILE="${ETHERPADDIR}/etherpad/data/etherpad.pid"
echo $$ > $PID_FILE

cd "$ETHERPADDIR/etherpad"

# the argument here is the maximum amount of RAM to allocate
exec bin/run-local.sh  "$@" --etherpad.soffice="$SOFFICE_BIN" 256M
