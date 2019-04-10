import { mapValues, noUndefined } from "./util";

/**
 * Class to model a buildspec version 0.2
 */
export class BuildSpec {
  public static literal(struct: BuildSpecStruct) {
    return new BuildSpec(struct);
  }

  public static simple(props: SimpleBuildSpecProps) {
    if (props.secondaryArtifactDirectories !== undefined && props.primaryArtifactDirectory === undefined) {
      // FIXME: We should treat all artifacts the same and the primary at render time, otherwise
      // merging gets too complicated for no good reason.
      throw new Error('Secondary artifacts also require a primary artifact');
    }

    return new BuildSpec({
      version: "0.2",
      phases: noUndefined({
        pre_build: props.preBuild !== undefined ? { commands: props.preBuild } : undefined,
        build: props.build !== undefined ? { commands: props.build } : undefined,
      }),
      artifacts: props.primaryArtifactDirectory !== undefined ? noUndefined({
        "base-directory": props.primaryArtifactDirectory,
        "files": ['**/*'],
        "secondary-artifacts": props.secondaryArtifactDirectories !== undefined
            ? mapValues(props.secondaryArtifactDirectories, d => ({ "base-directory": d, "files": ['**/*'] }))
            : undefined,
      }) : undefined,
    });
  }

  public static empty() {
    return new BuildSpec({ version: "0.2" });
  }

  private constructor(private readonly spec: BuildSpecStruct) {
  }

  public merge(other: BuildSpec, options: MergeOptions = {}): BuildSpec {
    return new BuildSpec({
      "version": "0.2",
      "run-as": mergeObj(this.spec["run-as"], other.spec["run-as"], equalObjects),
      "env": mergeObj(this.spec.env, other.spec.env, (a, b) => ({
        "parameter-store": mergeDict(a["parameter-store"], b["parameter-store"], equalObjects),
        "variables": mergeDict(a.variables, b.variables, equalObjects)
      })),
      "phases": mergeDict(this.spec.phases, other.spec.phases, (a, b) => ({
        "run-as": mergeObj(this.spec["run-as"], other.spec["run-as"], equalObjects),
        "commands": mergeList(a.commands, b.commands)!,
        "finally": mergeList(a.finally, b.finally),
      })),
      "artifacts": mergeObj(this.spec.artifacts, other.spec.artifacts, mergeArtifacts),
      "cache": mergeObj(this.spec.cache, other.spec.cache, (a, b) => ({
        paths: mergeList(a.paths, b.paths)!
      }))
    });

    function mergeArtifacts(a: PrimaryArtifactStruct, b: PrimaryArtifactStruct): PrimaryArtifactStruct {
      if (!options.renamePrimaryArtifact) {
        throw new Error('Right-hand-side has primary artifact. Must supply renamePrimaryArtifact.');
      }

      const artifacts = Object.assign({}, a["secondary-artifacts"] || {});
      if (options.renamePrimaryArtifact in artifacts) {
        throw new Error(`There is already an artifact with name ${options.renamePrimaryArtifact}`);
      }
      artifacts[options.renamePrimaryArtifact] = Object.assign({}, b, { 'secondary-artifacts': undefined });
      for (const [k, v] of Object.entries(b["secondary-artifacts"] || {})) {
        if (k in artifacts) {
          throw new Error(`There is already an artifact with name ${k}`);
        }
        artifacts[k] = v;
      }
      return Object.assign({}, a, { 'secondary-artifacts': artifacts });
    }

    function equalObjects(a: string, b: string) {
      if (a !== b) {
        throw new Error(`Can't merge two different values for the same key: ${JSON.stringify(a)}, ${JSON.stringify(b)}`);
      }
      return b;
    }

    function mergeObj<T>(a: T | undefined, b: T | undefined, fn: (a: T, b: T) => T): T | undefined {
      if (a === undefined) { return b; }
      if (b === undefined) { return a; }
      return fn(a, b);
    }

    function mergeDict<T>(as: {[k: string]: T} | undefined, bs: {[k: string]: T} | undefined, fn: (a: T, b: T) => T) {
      return mergeObj(as, bs, (a, b) => {
        const ret = Object.assign({}, a);
        for (const [k, v] of Object.entries(b)) {
          if (ret[k]) {
            ret[k] = fn(ret[k], v);
          } else {
            ret[k] = v;
          }
        }
        return ret;
      });
    }

    function mergeList<T>(as: T[] | undefined, bs: T[] | undefined): T[] | undefined {
      return mergeObj(as, bs, (a, b) => a.concat(b));
    }
  }

  public render(): BuildSpecStruct {
    return this.spec;
  }
}

export interface MergeOptions {
  /**
   * Rename the primary artifact on the right-hand-side of the merge operation.
   *
   * Required if the RHS BuildSpec contains a primary artifact (it will become
   * a secondery artifact of the merged BuildSpec).
   *
   * @default - No renaming
   */
  renamePrimaryArtifact?: string;
}

export interface SimpleBuildSpecProps {
  preBuild?: string[];
  build?: string[];
  primaryArtifactDirectory?: string;
  secondaryArtifactDirectories?: {[name: string]: string};
}

export interface BuildSpecStruct {
  version: '0.2';
  'run-as'?: string;
  env?: EnvStruct;
  phases?: {[key: string]: PhaseStruct };
  artifacts?: PrimaryArtifactStruct;
  cache?: CacheStruct;
}

export interface EnvStruct {
  variables?: {[key: string]: string};
  'parameter-store'?: {[key: string]: string};
}

export interface PhaseStruct {
  'run-as'?: string;
  commands: string[];
  finally?: string[];
}

export interface ArtifactStruct {
  files: string[];
  name?: string;
  'base-directory'?: string;
  'discard-paths'?: 'yes' | 'no';
}

export interface PrimaryArtifactStruct extends ArtifactStruct {
  'secondary-artifacts'?: {[key: string]: ArtifactStruct};
}

export interface CacheStruct {
  paths: string[];
}
