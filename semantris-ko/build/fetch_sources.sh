#!/bin/sh
# 어휘 빌드에 쓰는 외부 목록 두 개를 data/ 로 내려받는다.
set -e
mkdir -p data
curl -sL -o data/full.txt \
  https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ko/ko_full.txt
curl -sL https://raw.githubusercontent.com/acidsound/korean_wordlist/master/wordslistUnique.txt \
  | tr ' ' '\n' | grep -v '^$' | sort -u > data/dict.txt
wc -l data/full.txt data/dict.txt
