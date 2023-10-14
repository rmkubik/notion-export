import fs from "fs/promises";
import path from "path";
import * as url from "url";
import sanitize from "sanitize-filename";
import { exec as execSync } from "child_process";
import { promisify } from "util";

const exec = promisify(execSync);

// .mjs files don't have __filename and __dirname
// variables anymore
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

// Notion used emoji for ratings
// Obsidian uses text
function resolveRating(rating) {
  switch (rating) {
    case "⭐️":
      return "fav";
    case "👍":
      return "good";
    case "〰️":
    case "〰":
      return "mid";
    case "👎":
      return "bad";
    default:
      return "";
  }
}

async function run() {
  // Path to Notion games database export
  const exportsDirPath = path.join(
    __dirname,
    "../exports/a1400735-e7a2-40f7-897b-4adf722b9fb7_Export-405997cf-4f08-4724-bb37-960445f473b6/Game 4150a8b6a78148ad8cf0652de443f1d5"
  );
  const outputDirPath = path.join(__dirname, "../output/one");

  const files = await fs.readdir(exportsDirPath);

  files.forEach(async (fileName) => {
    const filePath = path.join(exportsDirPath, fileName);
    const file = await fs.readFile(filePath, { encoding: "utf8" });

    const lines = file.split("\n");
    let title;

    const fields = {};
    let endOfFieldsIndex = -1;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      if (index === 0) {
        // Notion puts "file name" as an h1 at top of file
        title = line.substring(2);
      }

      // Index one is an empty line marking
      // the beginning of Notion fields.
      // They don't use real frontmatter separators.
      if (index > 1) {
        if (line === "") {
          // End of fields
          // Next line break is end of Notion fields
          endOfFieldsIndex = index;
          break;
        }

        const firstColonIndex = line.indexOf(":");
        fields[line.substring(0, firstColonIndex).trim()] = line
          .substring(firstColonIndex + 1)
          .trim();
      }
    }

    let body = "";

    // endOfFieldsIndex is -1 if no empty line
    // was found after the Notion file's fields.
    // This should usually (always?) happen if
    // the note has no body and just fields.
    if (endOfFieldsIndex > -1) {
      body = lines.slice(endOfFieldsIndex + 1).join("\n");
    }

    // Format outputFile document
    // for Obsidian format.
    let outputFile = "";
    outputFile += "---\n"; // frontmatter start
    outputFile += `rating: ${resolveRating(fields.Rating?.trim() ?? "")}\n`;
    outputFile += `status: ${fields.Playing?.toLowerCase() ?? ""}\n`;
    outputFile += `tags: ${fields.Tags?.toLowerCase() ?? ""}\n`;
    if (fields["When I Played"]) {
      // whenPlayed is not something we want on new files
      // only add it where it is relevant
      outputFile += `whenPlayed: ${fields["When I Played"]}\n`;
    }
    outputFile += "---\n"; // frontmatter end

    if (body) {
      outputFile += "\n" + body;
    }

    // sanitize makes sure no invalid chars
    // get set in filepath and cause failure
    // like : or /
    const outFilePath = path.join(outputDirPath, sanitize(title) + ".md");
    await fs.writeFile(outFilePath, outputFile);

    // SetFile is a MacOS command line tools
    // program that can set date created time
    // Node.js doesn't have a way to do this?
    // Not fully sure why! Seems to be a sort
    // of locked down thing?
    // -d is cdate / created date
    // -m is last modified date
    // https://www.ojisanseiuchi.com/2023/05/23/changing-the-file-creation-date-on-macos/
    // https://ss64.com/osx/setfile.html
    await exec(`SetFile -d "${fields.Created}" "${outFilePath}"`);
    await exec(`SetFile -m "${fields["Last Edited"]}" "${outFilePath}"`);
  });
}

run();
