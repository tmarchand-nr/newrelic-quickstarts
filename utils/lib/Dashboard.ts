import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

import type { QuickstartDashboardInput } from '../types/QuickstartMutationVariable';

import Component from './Component';
import {
  GITHUB_RAW_BASE_URL,
  DASHBOARD_REQUIRED_DATA_SOURCES_QUERY,
  DASHBOARD_SET_REQUIRED_DATA_SOURCES_MUTATION,
} from '../constants';
import { fetchNRGraphqlResults } from './nr-graphql-helpers';

interface DashboardConfig {
  name: string;
  description?: string;
  pages: any;
  variables?: any;
}

interface RequiredDataSources {
  id: string;
}

type DashboardRequiredDataSourcesQueryResults = {
  actor: {
    nr1Catalog: {
      dashboardTemplate: {
        metadata: {
          requiredDataSources: RequiredDataSources[];
        };
      };
    };
  };
};

type DashboardRequiredDataSourcesQueryVariables = {
  id: string;
};

type DashboardSetRequiredDataSourcesMutationResults = {
  dashboardTemplate: {
    id: string;
  };
};

type DashboardSetRequiredDataSourcesMutationVariables = {
  templateId: string;
  dataSourceIds: string[];
};

class Dashboard extends Component<DashboardConfig, QuickstartDashboardInput> {
  /**
   * @returns - filepath from top level directory.
   */
  getConfigFilePath(): string {
    const filePaths = glob.sync(
      path.join(this.basePath, 'dashboards', this.identifier, '*.json')
    );

    if (!Array.isArray(filePaths) || filePaths.length !== 1) {
      this.isValid = false;
      const errorMessage =
        filePaths.length > 1
          ? `Dashboard at ${this.identifier} contains multiple configuration files.\n`
          : `Dashboard at ${this.identifier} does not exist. Please double check this location.\n`;

      console.error(errorMessage);
      return '';
    }

    return Component.removeBasePath(filePaths[0], this.basePath);
  }

  /**
   * Read and parse a JSON file
   * @returns - The contents of the file
   */
  getConfigContent(): DashboardConfig {
    if (!this.isValid) {
      return this.config;
    }

    try {
      const file = fs.readFileSync(this.fullPath);
      return JSON.parse(file.toString('utf-8'));
    } catch (e) {
      console.log('Unable to read and parse JSON config', this.configPath);
      this.isValid = false;

      return this.config;
    }
  }

  /**
   * Get mutation variables from dashboard config
   * @returns - mutation variables for dashboard.
   */
  getMutationVariables(): QuickstartDashboardInput {
    if (!this.isValid) {
      console.error(
        `Dashboard is invalid.\nPlease check the dashboard at ${this.identifier}\n`
      );
    }

    const { name, description } = this.config;
    const screenshotPaths = this.getScreenshotPaths();

    return {
      description: description && description.trim(),
      displayName: name && name.trim(),
      rawConfiguration: JSON.stringify(this.config),
      sourceUrl: Component.getAssetSourceUrl(this.configPath),
      screenshots:
        screenshotPaths && screenshotPaths.map((s) => this.getScreenshotUrl(s)),
    };
  }

  /**
   * Grabs the paths for screenshots associated with dashboard
   * @returns - An array of filepaths to screenshots
   */
  getScreenshotPaths(): string[] {
    const splitConfigPath = path.dirname(this.fullPath);
    const globPattern = `${splitConfigPath}/*.+(jpeg|jpg|png)`;

    return glob.sync(globPattern);
  }

  /**
   * Constructs the url to screenshot based off raw github URL
   * for a dashboard's mutation variable
   * @returns - Object with URL for the mutation variable
   */
  getScreenshotUrl(screenshotPath: string): { url: string } {
    const splitConfigPath = path.dirname(this.configPath);
    const screenShotFileName = path.basename(screenshotPath);

    return {
      url: `${GITHUB_RAW_BASE_URL}/${splitConfigPath}/${screenShotFileName}`,
    };
  }

  static async getRequiredDataSources(templateId: string): Promise<string[]> {
    const { data, errors } = await fetchNRGraphqlResults<
      DashboardRequiredDataSourcesQueryVariables,
      DashboardRequiredDataSourcesQueryResults
    >({
      queryString: DASHBOARD_REQUIRED_DATA_SOURCES_QUERY,
      variables: { id: templateId },
    });

    if (errors) {
      Promise.reject(`Query for dashboard template id failed`);
    }

    const dataSourceIds =
      data?.actor?.nr1Catalog?.dashboardTemplate?.metadata?.requiredDataSources?.map(
        ({ id }) => id
      );

    return dataSourceIds;
  }

  static async submitSetRequiredDataSourcesMutation(
    templateId: string,
    newDataSourceIds: string[]
  ) {
    const currDataSourceIds = await this.getRequiredDataSources(templateId);
    const dataSourceIds = [
      ...new Set([...currDataSourceIds, ...newDataSourceIds]),
    ];

    const { data, errors } = await fetchNRGraphqlResults<
      DashboardSetRequiredDataSourcesMutationVariables,
      DashboardSetRequiredDataSourcesMutationResults
    >({
      queryString: DASHBOARD_SET_REQUIRED_DATA_SOURCES_MUTATION,
      variables: { templateId, dataSourceIds },
    });

    return { data, errors };
  }

  /**
   * Static method that returns a list of every dashboard
   * @returns - A list of all dashboards
   */
  static getAll(): Dashboard[] {
    return glob
      .sync(path.join(__dirname, '..', '..', 'dashboards', '*', '*.+(json)'))
      .map((dashboardPath) =>
        path.dirname(dashboardPath.split('dashboards/')[1])
      )
      .map((localPath) => new Dashboard(localPath));
  }
}

export default Dashboard;
