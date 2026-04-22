type MetaEventValue = string | number | boolean | string[] | number[] | null | undefined;
type MetaEventParams = Record<string, MetaEventValue>;
type CleanMetaEventValue = Exclude<MetaEventValue, null | undefined>;

declare global {
  interface Window {
    fbq?: (command: "track", eventName: string, params?: Record<string, CleanMetaEventValue>) => void;
  }
}

export function trackMetaEvent(eventName: string, params?: MetaEventParams) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") {
    return;
  }

  const cleanParams = params
    ? Object.entries(params).reduce<Record<string, CleanMetaEventValue>>((accumulator, [key, value]) => {
        if (value !== null && value !== undefined && value !== "") {
          accumulator[key] = value;
        }
        return accumulator;
      }, {})
    : undefined;

  if (cleanParams && Object.keys(cleanParams).length > 0) {
    window.fbq("track", eventName, cleanParams);
    return;
  }

  window.fbq("track", eventName);
}
