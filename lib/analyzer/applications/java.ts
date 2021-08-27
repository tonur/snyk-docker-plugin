import * as admzip from "adm-zip";
import * as path from "path";
import { bufferToSha1 } from "../../buffer-utils";
import { JarFingerprintsFact } from "../../facts";
import { JarFingerprint } from "../types";
import { JarBuffer } from "./types";
import { AppDepsScanResultWithoutTarget, FilePathToBuffer } from "./types";

function groupJarFingerprintsByPath(input: {
  [fileName: string]: Buffer;
}): {
  [path: string]: JarBuffer[];
} {
  const jarFingerprints: JarBuffer[] = Object.entries(input).map(
    ([filePath, digest]) => {
      return {
        location: filePath,
        digest,
      };
    },
  );

  const resultAggregatedByPath = jarFingerprints.reduce(
    (jarsAggregatedByPath, jarFingerprint) => {
      const location = path.dirname(jarFingerprint.location);
      jarsAggregatedByPath[location] = jarsAggregatedByPath[location] || [];
      jarsAggregatedByPath[location].push(jarFingerprint);
      return jarsAggregatedByPath;
    },
    {},
  );

  return resultAggregatedByPath;
}

export async function jarFilesToScannedProjects(
  filePathToContent: FilePathToBuffer,
  targetImage: string,
  shadedJars: boolean,
): Promise<AppDepsScanResultWithoutTarget[]> {
  const mappedResult = groupJarFingerprintsByPath(filePathToContent);
  const scanResults: AppDepsScanResultWithoutTarget[] = [];

  for (const path in mappedResult) {
    if (!mappedResult.hasOwnProperty(path)) {
      continue;
    }

    let getJarFingerprints = getJarSha;
    if (shadedJars) {
      getJarFingerprints = checkIfFatJarsAndUnpack;
    }

    const jarFingerprintsFact: JarFingerprintsFact = {
      type: "jarFingerprints",
      data: {
        fingerprints: getJarFingerprints(mappedResult[path]),
        origin: targetImage,
        path,
      },
    };
    scanResults.push({
      facts: [jarFingerprintsFact],
      identity: {
        type: "maven",
        targetFile: path,
      },
    });
  }

  return scanResults;
}

function getJarSha(jarBuffers: JarBuffer[]): JarFingerprint[] {
  return jarBuffers.map((element) => {
    return {
      ...element,
      digest: bufferToSha1(element.digest),
    };
  });
}

function checkIfFatJarsAndUnpack(jarBuffers: JarBuffer[]): JarFingerprint[] {
  const fingerprints: JarFingerprint[] = [];

  for (const jarBuffer of jarBuffers) {
    const nestedJars: JarBuffer[] = [];
    const buffer = jarBuffer.digest;
    const zip = new admzip(buffer);
    const zipEntries = zip.getEntries();

    for (const zipEntry of zipEntries) {
      if (zipEntry.entryName.endsWith(".jar")) {
        nestedJars.push({
          location: zipEntry.entryName,
          digest: zipEntry.getData(),
        });
      }
    }

    if (nestedJars.length > 0) {
      fingerprints.push(
        ...nestedJars.map((element) => {
          return {
            ...element,
            digest: bufferToSha1(element.digest),
          };
        }),
      );
    } else {
      fingerprints.push({
        location: jarBuffer.location,
        digest: bufferToSha1(jarBuffer.digest),
      });
    }
  }

  return fingerprints;
}
