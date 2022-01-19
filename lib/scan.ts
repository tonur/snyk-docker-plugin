import * as fs from "fs";
import * as path from "path";

import { getImageArchive } from "./analyzer/image-inspector";
import { readDockerfileAndAnalyse } from "./dockerfile";
import { DockerFileAnalysis } from "./dockerfile/types";
import { fullImageSavePath } from "./image-save-path";
import { getArchivePath, getImageType } from "./image-type";
import { isNumber, isTrue } from "./option-utils";
import * as staticModule from "./static";
import { ImageType, PluginOptions, PluginResponse } from "./types";

// Registry credentials may also be provided by env vars. When both are set, flags take precedence.
export function mergeEnvVarsIntoCredentials(
  options: Partial<PluginOptions>,
): void {
  options.username = options.username || process.env.SNYK_REGISTRY_USERNAME;
  options.password = options.password || process.env.SNYK_REGISTRY_PASSWORD;
}

export async function scan(
  options?: Partial<PluginOptions>,
): Promise<PluginResponse> {
  // if (!options) {
  //   throw new Error("No plugin options provided");
  // }

  // mergeEnvVarsIntoCredentials(options);

  // if (!options.path) {
  //   throw new Error("No image identifier or path provided");
  // }

  // const nestedJarsDepth =
  //   options["nested-jars-depth"] || options["shaded-jars-depth"];
  // if (
  //   (isTrue(nestedJarsDepth) || isNumber(nestedJarsDepth)) &&
  //   !isTrue(options["app-vulns"])
  // ) {
  //   throw new Error(
  //     "To use --nested-jars-depth, you must also use --app-vulns",
  //   );
  // }

  // if (
  //   (!isNumber(nestedJarsDepth) &&
  //     !isTrue(nestedJarsDepth) &&
  //     typeof nestedJarsDepth !== "undefined") ||
  //   Number(nestedJarsDepth) < 0
  // ) {
  //   throw new Error(
  //     "--nested-jars-depth accepts only numbers bigger than or equal to 0",
  //   );
  // }

  // const targetImage = appendLatestTagIfMissing(options.path);
  const targetImage = "";

  const dockerfilePath = options.file;
  const dockerfileAnalysis = await readDockerfileAndAnalyse(dockerfilePath);

  const imageType = "machine";
  switch (imageType) {
    case ImageType.DockerArchive:
    case ImageType.OciArchive:
      return localArchiveAnalysis(
        targetImage,
        imageType,
        dockerfileAnalysis,
        options,
      );
    case ImageType.Identifier:
      return imageIdentifierAnalysis(
        targetImage,
        imageType,
        dockerfileAnalysis,
        options,
      );
    case "machine": 
    return machineAnalysis( );

    default:
      throw new Error("Unhandled image type for image " + targetImage);
  }
}

async function machineAnalysis() {
  return await staticModule.analyzeStatically();
}

async function localArchiveAnalysis(
  targetImage: string,
  imageType: ImageType,
  dockerfileAnalysis: DockerFileAnalysis | undefined,
  options: Partial<PluginOptions>,
): Promise<PluginResponse> {
  const globToFind = {
    include: options.globsToFind?.include || [],
    exclude: options.globsToFind?.exclude || [],
  };

  const archivePath = getArchivePath(targetImage);
  if (!fs.existsSync(archivePath)) {
    throw new Error(
      "The provided archive path does not exist on the filesystem",
    );
  }
  if (!fs.lstatSync(archivePath).isFile()) {
    throw new Error("The provided archive path is not a file");
  }

  const imageIdentifier =
    options.imageNameAndTag ||
    // The target image becomes the base of the path, e.g. "archive.tar" for "/var/tmp/archive.tar"
    path.basename(archivePath);

  return await staticModule.analyzeStatically(
    imageIdentifier,
    dockerfileAnalysis,
    imageType,
    archivePath,
    globToFind,
    options,
  );
}

async function imageIdentifierAnalysis(
  targetImage: string,
  imageType: ImageType,
  dockerfileAnalysis: DockerFileAnalysis | undefined,
  options: Partial<PluginOptions>,
): Promise<PluginResponse> {
  const globToFind = {
    include: options.globsToFind?.include || [],
    exclude: options.globsToFind?.exclude || [],
  };

  const imageSavePath = fullImageSavePath(options.imageSavePath);
  const archiveResult = await getImageArchive(
    targetImage,
    imageSavePath,
    options.username,
    options.password,
    options.platform,
  );

  const imagePath = archiveResult.path;
  try {
    return await staticModule.analyzeStatically(
      targetImage,
      dockerfileAnalysis,
      imageType,
      imagePath,
      globToFind,
      options,
    );
  } finally {
    archiveResult.removeArchive();
  }
}

export function appendLatestTagIfMissing(targetImage: string): string {
  if (
    getImageType(targetImage) === ImageType.Identifier &&
    !targetImage.includes(":")
  ) {
    return `${targetImage}:latest`;
  }
  return targetImage;
}
