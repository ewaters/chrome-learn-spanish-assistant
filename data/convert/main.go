package main

import (
	"encoding/csv"
	"encoding/json"
	"flag"
	"io"
	"io/ioutil"
	"log"
	"os"
)

var (
	inputFile  = flag.String("input", "", "")
	outputFile = flag.String("output", "", "")
)

type translation [2]string

func tr(spa, eng string) translation {
	return [2]string{spa, eng}
}

type forms [6]string

type conjugation struct {
	Desc  string
	Forms forms
}

type entry struct {
	Infinitive   translation
	Gerund       translation
	Participle   translation
	Conjugations map[string]map[string]conjugation
}

const (
	colInf = iota
	colInfEng
	colMood
	colMoodEng
	colTense
	colTenseEng
	colVerbEng
	colForm1s
	colForm2s
	colForm3s
	colForm1p
	colForm2p
	colForm3p
	colGerund
	colGerundEng
	colPart
	colPartEng
)

func main() {
	flag.Parse()

	f, err := os.Open(*inputFile)
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.LazyQuotes = true
	i := 0
	data := make(map[string]*entry)
	for {
		record, err := r.Read()
		i++
		if i == 1 {
			continue
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Fatal(err)
		}
		key := record[colInf]
		if _, ok := data[key]; !ok {
			data[key] = &entry{
				Infinitive:   tr(record[colInf], record[colInfEng]),
				Gerund:       tr(record[colGerund], record[colGerundEng]),
				Participle:   tr(record[colPart], record[colPartEng]),
				Conjugations: make(map[string]map[string]conjugation),
			}
		}
		d := data[key]
		m, t := record[colMoodEng], record[colTenseEng]
		if d.Conjugations[m] == nil {
			d.Conjugations[m] = make(map[string]conjugation)
		}
		d.Conjugations[m][t] = conjugation{
			Desc: record[colVerbEng],
			Forms: forms{
				record[colForm1s],
				record[colForm2s],
				record[colForm3s],
				record[colForm1p],
				record[colForm2p],
				record[colForm3p],
			},
		}

	}

	for _, e := range data {
		// TODO: Check if the verb is irregular, and if so, how.
	}

	b, err := json.Marshal(data)
	if err != nil {
		log.Fatal(err)
	}

	if err := ioutil.WriteFile(*outputFile, b, 0644); err != nil {
		log.Fatal(err)
	}
}
