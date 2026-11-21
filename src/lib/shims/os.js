export const platform = () => (typeof process !== "undefined" && process.platform ? process.platform : "linux");
export const arch = () => (typeof process !== "undefined" && process.arch ? process.arch : "x64");
export const type = () => "Linux";
export const release = () => "1.0.0";
export const hostname = () => "localhost";
export const homedir = () => "/";
export const tmpdir = () => "/tmp";
export const cpus = () => [];

export default {
  platform,
  arch,
  type,
  release,
  hostname,
  homedir,
  tmpdir,
  cpus,
};
