import fetch from "node-fetch";
import fs from "node:fs/promises";
import { Command } from "commander";

const COMPONENT = "TC39 Proposals";

const STAGE_EPICS = {
  "1": "SJP-184",
  "2": "SJP-185",
  "2.7": "SJP-186",
  "3": "SJP-187",
  "4": "SJP-188"
};

// This function will parse an exported csv file from Jira to create a
// mapping between the JIRA key and the TC39 dataset id. This can be
// used to update existing JIRA issues with changes from the dataset.
async function parseJiraCsv(filename) {
  let handle = await fs.open(filename, "r");
  let mapping = {};
  for await (const line of handle.readLines()) {
    let key = line.match(/(SJP\-[0-9]+)/);
    if (key === null) {
      continue;
    }
    let id = line.match(/id: ([A-Za-z0-9.-]+)/);
    if (id === null || id[1] == "undefined") {
      continue;
    }
    mapping[id[1]] = key[1];
  }
  handle.close();

  handle = await fs.open("keys.json", "w");
  handle.write(JSON.stringify(mapping));
  handle.close();
}

async function parseTC39Dataset(filename) {
  let data;
  if (filename === true) {
    const response = await fetch("https://tc39.es/dataset/proposals.json");
    data = await response.json();
  } else {
    const handle = await fs.open(filename, "r");
    data = JSON.parse(await handle.readFile());
    handle.close();
  }

  let handle = await fs.open("keys.json", "r");
  let issueKeys = JSON.parse(await handle.readFile());
  handle.close();

  handle = await fs.open("proposals.csv", "w");
  await handle.write("Issue Key, Summary, Description, Component, Parent\n");

  const DTF = new Intl.DateTimeFormat("en-CA", {dateStyle: "short"});

  for (let proposal of data) {
    if (proposal.stage >= 1) {
      // Skip Stage 4 proposals that are from before 2024, as they are
      // not relevant for implementation.
      if (proposal.stage == 4 && proposal.edition < 2024) {
        continue;
      }

      if (proposal.id === undefined) {
        // These were imported with the initial data, but will have to be
        // updated by hand in the future, because we can't determine an
        // unique Jira issue key for it.
        continue;
      }

      let issueKey = issueKeys[proposal.id];
      if (issueKey === undefined) {
        // We'll map this to the empty string, Jira will create a new issue.
        issueKey = "";
        console.log("Warning: found new proposal with id: " + proposal.id);
      }

      let notes = [];
      for (let idx in proposal.notes) {
        let note = proposal.notes[idx];
        let date = Date.parse(note.date);
        if (date) {
          notes.push({date: date, url: note.url});
        }
      }
      notes.sort((a, b) => a.date - b.date);
      let noteString = "notes:\n"
      for (let note of notes) {
        noteString += `  - ${DTF.format(note.date)}: ${note.url}\n`
      }
      let description = `id: ${proposal.id}\nurl: ${proposal.url}\n${noteString}`;
      await handle.write(`"${issueKey}", "${proposal.name}", "${description}", "${COMPONENT}", "${STAGE_EPICS[proposal.stage]}"\n`);
    }
  }
  handle.close();
}

const program = new Command();
program
  .option('--parse-jira-csv [filename]')
  .option('--parse-tc39-dataset [filename]');
program.parse();
const options = program.opts();

if (options.parseJiraCsv) {
  parseJiraCsv(options.parseJiraCsv === true ? "Jira.csv" : options.parseJiraCsv);
} else if (options.parseTc39Dataset) {
  parseTC39Dataset(options.parseTc39Dataset);
}
