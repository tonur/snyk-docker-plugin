import { AnalysisType, StaticAnalysis } from "../analyzer/types";

export function parseAnalysisResults(targetImage, analysis: StaticAnalysis) {
  let analysisResult = analysis.results.filter((res) => {
    return res.Analysis && res.Analysis.length > 0;
  })[0];

  if (!analysisResult) {
    // Special case when we have no package management
    // on scratch images or images with unknown package manager
    analysisResult = {
      Image: targetImage,
      AnalyzeType: AnalysisType.Linux,
      Analysis: [],
    };
  }

  let packageFormat: string;
  switch (analysisResult.AnalyzeType) {
    case AnalysisType.Apt: {
      packageFormat = "deb";
      break;
    }
    default: {
      packageFormat = analysisResult.AnalyzeType.toLowerCase();
    }
  }

  return {
    imageId: analysis.imageId,
    platform: analysis.platform,
    targetOS: analysis.osRelease,
    packageFormat,
    depInfosList: analysisResult.Analysis,
    imageLayers: analysis.imageLayers,
  };
}
