import type { RPCSchema } from "electrobun/bun";

export type NoraRPC = {
  bun: RPCSchema<{
    requests: {
      clearData: {
        params: void;
        response: void;
      };
      clearProfileData: {
        params: string;
        response: void;
      };
      fetchText: {
        params: { url: string; headers?: Record<string, string> };
        response: {
          status: number;
          body: string;
          headers: { etag?: string; 'last-modified'?: string };
        };
      };
      downloadVideo: {
        params: string;
        response: void;
      };
      deleteBlocklistMatcherSnapshot: {
        params: void;
        response: void;
      };
      deleteBlocklistSources: {
        params: void;
        response: void;
      };
      hasBlocklistSourceFiles: {
        params: void;
        response: boolean;
      };
      readBlocklistMatcherSnapshot: {
        params: void;
        response: any;
      };
      readBlocklistSource: {
        params: string;
        response: string;
      };
      writeBlocklistSource: {
        params: { profile: string; data: string };
        response: void;
      };
      writeBlocklistMatcherSnapshot: {
        params: any;
        response: void;
      };
      setBlocklist: {
        params: any;
        response: void;
      };
    };
  }>;
  webview: RPCSchema<{
    messages: {
      openSettings: void;
      openNav: void;
      handleDeeplink: string;
      showToast: string;
    };
  }>;
};
