import { getPackages, getPackagesSqlite } from "@snyk/rpm-parser";
import { PackageInfo } from "@snyk/rpm-parser/lib/rpm/types";
import { IParserSqliteResponse } from "@snyk/rpm-parser/lib/types";
import * as Debug from "debug";
import { writeFile as writeFileFs } from "fs";
import { normalize as normalizePath } from "path";
import { fileSync } from "tmp";
import { promisify } from "util";
import { getContentAsBuffer } from "../../extractor";
import { ExtractAction, ExtractedLayers } from "../../extractor/types";
import { streamToBuffer } from "../../stream-utils";

const debug = Debug("snyk");

const writeFile = promisify(writeFileFs);

export const getRpmDbFileContentAction: ExtractAction = {
  actionName: "rpm-db",
  filePathMatches: (filePath) =>
    filePath === normalizePath("/var/lib/rpm/Packages") ||
    filePath === normalizePath("/usr/lib/sysimage/rpm/Packages"),
  callback: streamToBuffer,
};

export async function getRpmDbFileContent(
  extractedLayers: ExtractedLayers,
): Promise<string> {
  const rpmDb = getContentAsBuffer(extractedLayers, getRpmDbFileContentAction);
  if (!rpmDb) {
    return "";
  }

  try {
    const parserResponse = await getPackages(rpmDb);
    if (parserResponse.error !== undefined) {
      throw parserResponse.error;
    }
    return parserResponse.response;
  } catch (error) {
    debug(
      `An error occurred while analysing RPM packages: ${JSON.stringify(
        error,
      )}`,
    );
    return "";
  }
}

export async function getRpmSqliteDbFileContent(
  extractedLayers: ExtractedLayers,
): Promise<PackageInfo[]> {
  const rpmDb = getContentAsBuffer(
    extractedLayers,
    getRpmSqliteDbFileContentAction,
  );
  if (!rpmDb) {
    return [];
  }

  try {
    const tempFileObj = fileSync();
    await writeFile(tempFileObj.fd, rpmDb);

    const results: IParserSqliteResponse = await getPackagesSqlite(
      tempFileObj.name,
    );

    tempFileObj.removeCallback(); // removing the temp file created after processing
    if (results.error) {
      throw results.error;
    }
    return results.response;
  } catch (error) {
    debug(
      `An error occurred while analysing RPM packages: ${JSON.stringify(
        error,
      )}`,
    );
    return [];
  }
}

export const getRpmSqliteDbFileContentAction: ExtractAction = {
  actionName: "rpm-sqlite-db",
  filePathMatches: (filePath) =>
    filePath === normalizePath("/var/lib/rpm/rpmdb.sqlite") ||
    filePath === normalizePath("/usr/lib/sysimage/rpm/rpmdb.sqlite") ||
    filePath === normalizePath("/usr/lib/sysimage/rpm/Packages.db"),
  callback: streamToBuffer,
};
