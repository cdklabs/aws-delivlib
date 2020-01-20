import { mapValues, noUndefined } from "./util";

const MAGIC_ARTIFACT_NAME = 'PRIMARY';

/**
 * Class to model a buildspec version 0.2
 *
 * Artifact handling is a little special: CodeBuild will interpret the
 * 'artifacts' section differently depending on whether there are secondary
 * artifacts or not.
 *
 * If there is only one artifact, the single artifact must go into the top-level
 * 'artifacts' section. If there are multiple artifacts, all of them must go
 * into the 'secondary-artifacts' section. Upon rendering to JSON, the caller
 * must supply the name of the primary artifact (it's determined by
 * the CodePipeline Action that invokes the CodeBuild Project that uses this
 * buildspec).
 *
 * INVARIANT: in-memory, the BuildSpec will treat all artifacts the same (as
 * a bag of secondary artifacts). At the edges (construction or rendering),
 * if there's only a single artifact it will be rendered to the primary
 * artifact.
 */
export class BuildSpec {
  public static literal(struct: BuildSpecStruct) {
    return new BuildSpec(struct);
  }

  public static simple(props: SimpleBuildSpecProps) {
    // We merge the primary artifact into the secondary artifacts under a special key
    // They will be compacted back together during rendering.
    const artifactDirectories = Object.assign({},
      props.additionalArtifactDirectories || {},
      props.artifactDirectory ? {[MAGIC_ARTIFACT_NAME]: props.artifactDirectory} : {}
    );

    let artifacts: PrimaryArtifactStruct | undefined;
    if (Object.keys(artifactDirectories || {}).length > 0) {
      artifacts = {
        'secondary-artifacts': mapValues(artifactDirectories!, d => ({
          'base-directory': d,
          'files': ['**/*'],
        }))
      };
    }

    return new BuildSpec({
      version: "0.2",
      phases: noUndefined({
        pre_build: props.preBuild !== undefined ? { commands: props.preBuild } : undefined,
        build: props.build !== undefined ? { commands: props.build } : undefined,
      }),
      artifacts,
    });
  }

  public static empty() {
    return new BuildSpec({ version: "0.2" });
  }

  private constructor(private readonly spec: BuildSpecStruct) {
  }

  public get additionalArtifactNames(): string[] {
    return Object.keys(this.spec.artifacts && this.spec.artifacts["secondary-artifacts"] || {}).filter(n => n !== MAGIC_ARTIFACT_NAME);
  }

  public merge(other: BuildSpec): BuildSpec {
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
      if (a.files || b.files) {
        throw new Error('None of the BuildSpecs may have a primary artifact.');
      }

      const artifacts = Object.assign({}, a["secondary-artifacts"] || {});
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

  public render(options: BuildSpecRenderOptions = {}): BuildSpecStruct {
    return Object.assign({}, this.spec, { artifacts: this.renderArtifacts(options) });
  }

  private renderArtifacts(options: BuildSpecRenderOptions): PrimaryArtifactStruct | undefined {
    if (!this.spec.artifacts || !this.spec.artifacts['secondary-artifacts']) { return this.spec.artifacts; }

    // Simplify a single "secondary-artifacts" to a single primary artifact (regardless of the name)
    const singleArt = dictSingletonValue(this.spec.artifacts['secondary-artifacts']);
    if (singleArt) { return singleArt; }

    // Otherwise rename a 'PRIMARY' key if it exists
    if (MAGIC_ARTIFACT_NAME in this.spec.artifacts['secondary-artifacts']) {
      if (!options.primaryArtifactName) {
        throw new Error(`Replacement name for ${MAGIC_ARTIFACT_NAME} artifact not supplied`);
      }

      return { 'secondary-artifacts': renameKey(this.spec.artifacts['secondary-artifacts'], MAGIC_ARTIFACT_NAME, options.primaryArtifactName) };
    }

    return this.spec.artifacts;
  }
}

export interface SimpleBuildSpecProps {
  preBuild?: string[];
  build?: string[];

  artifactDirectory?: string;

  /**
   * Where the directories for each artifact are
   *
   * Use special name PRIMARY to refer to the primary artifact. Will be
   * replaced with the actual artifact name when the build spec is synthesized.
   */
  additionalArtifactDirectories?: {[id: string]: string};
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
  files?: string[];
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

export interface BuildSpecRenderOptions {
  /**
   * Replace PRIMARY artifact name with this
   *
   * Cannot use the special term PRIMARY if this is not supplied.
   *
   * @default  Cannot use PRIMARY
   */
  primaryArtifactName?: string;
}

/**
 * If the dict is a singleton dict, return the value of the first key, otherwise return undefined
 */
function dictSingletonValue<T>(xs: {[key: string]: T}): T | undefined {
  const keys = Object.keys(xs);
  if (keys.length === 1) {
    return xs[keys[0]];
  }
  return undefined;
}

function renameKey<T>(xs: {[key: string]: T}, orig: string, rename: string): {[key: string]: T} {
  const ret = Object.assign({}, xs);
  if (orig in ret) {
    ret[rename] = ret[orig];
    delete ret[orig];
  }
  return ret;
}
