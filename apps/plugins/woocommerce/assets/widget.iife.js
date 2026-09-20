(function() {
  "use strict";
  const MAX_MIX_AND_MATCH_GARMENTS = 3;
  const VISION_UNAVAILABLE_ERROR = "VISION_UNAVAILABLE";
  var util;
  (function(util2) {
    util2.assertEqual = (_) => {
    };
    function assertIs(_arg) {
    }
    util2.assertIs = assertIs;
    function assertNever(_x) {
      throw new Error();
    }
    util2.assertNever = assertNever;
    util2.arrayToEnum = (items) => {
      const obj = {};
      for (const item of items) {
        obj[item] = item;
      }
      return obj;
    };
    util2.getValidEnumValues = (obj) => {
      const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
      const filtered = {};
      for (const k of validKeys) {
        filtered[k] = obj[k];
      }
      return util2.objectValues(filtered);
    };
    util2.objectValues = (obj) => {
      return util2.objectKeys(obj).map(function(e) {
        return obj[e];
      });
    };
    util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
      const keys = [];
      for (const key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          keys.push(key);
        }
      }
      return keys;
    };
    util2.find = (arr, checker) => {
      for (const item of arr) {
        if (checker(item))
          return item;
      }
      return void 0;
    };
    util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
    function joinValues(array, separator = " | ") {
      return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
    }
    util2.joinValues = joinValues;
    util2.jsonStringifyReplacer = (_, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    };
  })(util || (util = {}));
  var objectUtil;
  (function(objectUtil2) {
    objectUtil2.mergeShapes = (first, second) => {
      return {
        ...first,
        ...second
        // second overwrites first
      };
    };
  })(objectUtil || (objectUtil = {}));
  const ZodParsedType = util.arrayToEnum([
    "string",
    "nan",
    "number",
    "integer",
    "float",
    "boolean",
    "date",
    "bigint",
    "symbol",
    "function",
    "undefined",
    "null",
    "array",
    "object",
    "unknown",
    "promise",
    "void",
    "never",
    "map",
    "set"
  ]);
  const getParsedType = (data) => {
    const t = typeof data;
    switch (t) {
      case "undefined":
        return ZodParsedType.undefined;
      case "string":
        return ZodParsedType.string;
      case "number":
        return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
      case "boolean":
        return ZodParsedType.boolean;
      case "function":
        return ZodParsedType.function;
      case "bigint":
        return ZodParsedType.bigint;
      case "symbol":
        return ZodParsedType.symbol;
      case "object":
        if (Array.isArray(data)) {
          return ZodParsedType.array;
        }
        if (data === null) {
          return ZodParsedType.null;
        }
        if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
          return ZodParsedType.promise;
        }
        if (typeof Map !== "undefined" && data instanceof Map) {
          return ZodParsedType.map;
        }
        if (typeof Set !== "undefined" && data instanceof Set) {
          return ZodParsedType.set;
        }
        if (typeof Date !== "undefined" && data instanceof Date) {
          return ZodParsedType.date;
        }
        return ZodParsedType.object;
      default:
        return ZodParsedType.unknown;
    }
  };
  const ZodIssueCode = util.arrayToEnum([
    "invalid_type",
    "invalid_literal",
    "custom",
    "invalid_union",
    "invalid_union_discriminator",
    "invalid_enum_value",
    "unrecognized_keys",
    "invalid_arguments",
    "invalid_return_type",
    "invalid_date",
    "invalid_string",
    "too_small",
    "too_big",
    "invalid_intersection_types",
    "not_multiple_of",
    "not_finite"
  ]);
  class ZodError extends Error {
    get errors() {
      return this.issues;
    }
    constructor(issues) {
      super();
      this.issues = [];
      this.addIssue = (sub) => {
        this.issues = [...this.issues, sub];
      };
      this.addIssues = (subs = []) => {
        this.issues = [...this.issues, ...subs];
      };
      const actualProto = new.target.prototype;
      if (Object.setPrototypeOf) {
        Object.setPrototypeOf(this, actualProto);
      } else {
        this.__proto__ = actualProto;
      }
      this.name = "ZodError";
      this.issues = issues;
    }
    format(_mapper) {
      const mapper = _mapper || function(issue) {
        return issue.message;
      };
      const fieldErrors = { _errors: [] };
      const processError = (error) => {
        for (const issue of error.issues) {
          if (issue.code === "invalid_union") {
            issue.unionErrors.map(processError);
          } else if (issue.code === "invalid_return_type") {
            processError(issue.returnTypeError);
          } else if (issue.code === "invalid_arguments") {
            processError(issue.argumentsError);
          } else if (issue.path.length === 0) {
            fieldErrors._errors.push(mapper(issue));
          } else {
            let curr = fieldErrors;
            let i = 0;
            while (i < issue.path.length) {
              const el = issue.path[i];
              const terminal = i === issue.path.length - 1;
              if (!terminal) {
                curr[el] = curr[el] || { _errors: [] };
              } else {
                curr[el] = curr[el] || { _errors: [] };
                curr[el]._errors.push(mapper(issue));
              }
              curr = curr[el];
              i++;
            }
          }
        }
      };
      processError(this);
      return fieldErrors;
    }
    static assert(value) {
      if (!(value instanceof ZodError)) {
        throw new Error(`Not a ZodError: ${value}`);
      }
    }
    toString() {
      return this.message;
    }
    get message() {
      return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
    }
    get isEmpty() {
      return this.issues.length === 0;
    }
    flatten(mapper = (issue) => issue.message) {
      const fieldErrors = {};
      const formErrors = [];
      for (const sub of this.issues) {
        if (sub.path.length > 0) {
          const firstEl = sub.path[0];
          fieldErrors[firstEl] = fieldErrors[firstEl] || [];
          fieldErrors[firstEl].push(mapper(sub));
        } else {
          formErrors.push(mapper(sub));
        }
      }
      return { formErrors, fieldErrors };
    }
    get formErrors() {
      return this.flatten();
    }
  }
  ZodError.create = (issues) => {
    const error = new ZodError(issues);
    return error;
  };
  const errorMap = (issue, _ctx) => {
    let message;
    switch (issue.code) {
      case ZodIssueCode.invalid_type:
        if (issue.received === ZodParsedType.undefined) {
          message = "Required";
        } else {
          message = `Expected ${issue.expected}, received ${issue.received}`;
        }
        break;
      case ZodIssueCode.invalid_literal:
        message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
        break;
      case ZodIssueCode.unrecognized_keys:
        message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
        break;
      case ZodIssueCode.invalid_union:
        message = `Invalid input`;
        break;
      case ZodIssueCode.invalid_union_discriminator:
        message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
        break;
      case ZodIssueCode.invalid_enum_value:
        message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
        break;
      case ZodIssueCode.invalid_arguments:
        message = `Invalid function arguments`;
        break;
      case ZodIssueCode.invalid_return_type:
        message = `Invalid function return type`;
        break;
      case ZodIssueCode.invalid_date:
        message = `Invalid date`;
        break;
      case ZodIssueCode.invalid_string:
        if (typeof issue.validation === "object") {
          if ("includes" in issue.validation) {
            message = `Invalid input: must include "${issue.validation.includes}"`;
            if (typeof issue.validation.position === "number") {
              message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
            }
          } else if ("startsWith" in issue.validation) {
            message = `Invalid input: must start with "${issue.validation.startsWith}"`;
          } else if ("endsWith" in issue.validation) {
            message = `Invalid input: must end with "${issue.validation.endsWith}"`;
          } else {
            util.assertNever(issue.validation);
          }
        } else if (issue.validation !== "regex") {
          message = `Invalid ${issue.validation}`;
        } else {
          message = "Invalid";
        }
        break;
      case ZodIssueCode.too_small:
        if (issue.type === "array")
          message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
        else if (issue.type === "string")
          message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
        else if (issue.type === "number")
          message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
        else if (issue.type === "bigint")
          message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
        else if (issue.type === "date")
          message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
        else
          message = "Invalid input";
        break;
      case ZodIssueCode.too_big:
        if (issue.type === "array")
          message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
        else if (issue.type === "string")
          message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
        else if (issue.type === "number")
          message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
        else if (issue.type === "bigint")
          message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
        else if (issue.type === "date")
          message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
        else
          message = "Invalid input";
        break;
      case ZodIssueCode.custom:
        message = `Invalid input`;
        break;
      case ZodIssueCode.invalid_intersection_types:
        message = `Intersection results could not be merged`;
        break;
      case ZodIssueCode.not_multiple_of:
        message = `Number must be a multiple of ${issue.multipleOf}`;
        break;
      case ZodIssueCode.not_finite:
        message = "Number must be finite";
        break;
      default:
        message = _ctx.defaultError;
        util.assertNever(issue);
    }
    return { message };
  };
  let overrideErrorMap = errorMap;
  function getErrorMap() {
    return overrideErrorMap;
  }
  const makeIssue = (params) => {
    const { data, path, errorMaps, issueData } = params;
    const fullPath = [...path, ...issueData.path || []];
    const fullIssue = {
      ...issueData,
      path: fullPath
    };
    if (issueData.message !== void 0) {
      return {
        ...issueData,
        path: fullPath,
        message: issueData.message
      };
    }
    let errorMessage = "";
    const maps = errorMaps.filter((m) => !!m).slice().reverse();
    for (const map of maps) {
      errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
    }
    return {
      ...issueData,
      path: fullPath,
      message: errorMessage
    };
  };
  function addIssueToContext(ctx, issueData) {
    const overrideMap = getErrorMap();
    const issue = makeIssue({
      issueData,
      data: ctx.data,
      path: ctx.path,
      errorMaps: [
        ctx.common.contextualErrorMap,
        // contextual error map is first priority
        ctx.schemaErrorMap,
        // then schema-bound map if available
        overrideMap,
        // then global override map
        overrideMap === errorMap ? void 0 : errorMap
        // then global default map
      ].filter((x) => !!x)
    });
    ctx.common.issues.push(issue);
  }
  class ParseStatus {
    constructor() {
      this.value = "valid";
    }
    dirty() {
      if (this.value === "valid")
        this.value = "dirty";
    }
    abort() {
      if (this.value !== "aborted")
        this.value = "aborted";
    }
    static mergeArray(status, results) {
      const arrayValue = [];
      for (const s of results) {
        if (s.status === "aborted")
          return INVALID;
        if (s.status === "dirty")
          status.dirty();
        arrayValue.push(s.value);
      }
      return { status: status.value, value: arrayValue };
    }
    static async mergeObjectAsync(status, pairs) {
      const syncPairs = [];
      for (const pair of pairs) {
        const key = await pair.key;
        const value = await pair.value;
        syncPairs.push({
          key,
          value
        });
      }
      return ParseStatus.mergeObjectSync(status, syncPairs);
    }
    static mergeObjectSync(status, pairs) {
      const finalObject = {};
      for (const pair of pairs) {
        const { key, value } = pair;
        if (key.status === "aborted")
          return INVALID;
        if (value.status === "aborted")
          return INVALID;
        if (key.status === "dirty")
          status.dirty();
        if (value.status === "dirty")
          status.dirty();
        if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
          finalObject[key.value] = value.value;
        }
      }
      return { status: status.value, value: finalObject };
    }
  }
  const INVALID = Object.freeze({
    status: "aborted"
  });
  const DIRTY = (value) => ({ status: "dirty", value });
  const OK = (value) => ({ status: "valid", value });
  const isAborted = (x) => x.status === "aborted";
  const isDirty = (x) => x.status === "dirty";
  const isValid = (x) => x.status === "valid";
  const isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
  var errorUtil;
  (function(errorUtil2) {
    errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
    errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
  })(errorUtil || (errorUtil = {}));
  class ParseInputLazyPath {
    constructor(parent, value, path, key) {
      this._cachedPath = [];
      this.parent = parent;
      this.data = value;
      this._path = path;
      this._key = key;
    }
    get path() {
      if (!this._cachedPath.length) {
        if (Array.isArray(this._key)) {
          this._cachedPath.push(...this._path, ...this._key);
        } else {
          this._cachedPath.push(...this._path, this._key);
        }
      }
      return this._cachedPath;
    }
  }
  const handleResult = (ctx, result) => {
    if (isValid(result)) {
      return { success: true, data: result.value };
    } else {
      if (!ctx.common.issues.length) {
        throw new Error("Validation failed but no issues detected.");
      }
      return {
        success: false,
        get error() {
          if (this._error)
            return this._error;
          const error = new ZodError(ctx.common.issues);
          this._error = error;
          return this._error;
        }
      };
    }
  };
  function processCreateParams(params) {
    if (!params)
      return {};
    const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
    if (errorMap2 && (invalid_type_error || required_error)) {
      throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
    }
    if (errorMap2)
      return { errorMap: errorMap2, description };
    const customMap = (iss, ctx) => {
      const { message } = params;
      if (iss.code === "invalid_enum_value") {
        return { message: message ?? ctx.defaultError };
      }
      if (typeof ctx.data === "undefined") {
        return { message: message ?? required_error ?? ctx.defaultError };
      }
      if (iss.code !== "invalid_type")
        return { message: ctx.defaultError };
      return { message: message ?? invalid_type_error ?? ctx.defaultError };
    };
    return { errorMap: customMap, description };
  }
  class ZodType {
    get description() {
      return this._def.description;
    }
    _getType(input) {
      return getParsedType(input.data);
    }
    _getOrReturnCtx(input, ctx) {
      return ctx || {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      };
    }
    _processInputParams(input) {
      return {
        status: new ParseStatus(),
        ctx: {
          common: input.parent.common,
          data: input.data,
          parsedType: getParsedType(input.data),
          schemaErrorMap: this._def.errorMap,
          path: input.path,
          parent: input.parent
        }
      };
    }
    _parseSync(input) {
      const result = this._parse(input);
      if (isAsync(result)) {
        throw new Error("Synchronous parse encountered promise.");
      }
      return result;
    }
    _parseAsync(input) {
      const result = this._parse(input);
      return Promise.resolve(result);
    }
    parse(data, params) {
      const result = this.safeParse(data, params);
      if (result.success)
        return result.data;
      throw result.error;
    }
    safeParse(data, params) {
      const ctx = {
        common: {
          issues: [],
          async: params?.async ?? false,
          contextualErrorMap: params?.errorMap
        },
        path: params?.path || [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data,
        parsedType: getParsedType(data)
      };
      const result = this._parseSync({ data, path: ctx.path, parent: ctx });
      return handleResult(ctx, result);
    }
    "~validate"(data) {
      const ctx = {
        common: {
          issues: [],
          async: !!this["~standard"].async
        },
        path: [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data,
        parsedType: getParsedType(data)
      };
      if (!this["~standard"].async) {
        try {
          const result = this._parseSync({ data, path: [], parent: ctx });
          return isValid(result) ? {
            value: result.value
          } : {
            issues: ctx.common.issues
          };
        } catch (err) {
          if (err?.message?.toLowerCase()?.includes("encountered")) {
            this["~standard"].async = true;
          }
          ctx.common = {
            issues: [],
            async: true
          };
        }
      }
      return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
        value: result.value
      } : {
        issues: ctx.common.issues
      });
    }
    async parseAsync(data, params) {
      const result = await this.safeParseAsync(data, params);
      if (result.success)
        return result.data;
      throw result.error;
    }
    async safeParseAsync(data, params) {
      const ctx = {
        common: {
          issues: [],
          contextualErrorMap: params?.errorMap,
          async: true
        },
        path: params?.path || [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data,
        parsedType: getParsedType(data)
      };
      const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
      const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
      return handleResult(ctx, result);
    }
    refine(check, message) {
      const getIssueProperties = (val) => {
        if (typeof message === "string" || typeof message === "undefined") {
          return { message };
        } else if (typeof message === "function") {
          return message(val);
        } else {
          return message;
        }
      };
      return this._refinement((val, ctx) => {
        const result = check(val);
        const setError = () => ctx.addIssue({
          code: ZodIssueCode.custom,
          ...getIssueProperties(val)
        });
        if (typeof Promise !== "undefined" && result instanceof Promise) {
          return result.then((data) => {
            if (!data) {
              setError();
              return false;
            } else {
              return true;
            }
          });
        }
        if (!result) {
          setError();
          return false;
        } else {
          return true;
        }
      });
    }
    refinement(check, refinementData) {
      return this._refinement((val, ctx) => {
        if (!check(val)) {
          ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
          return false;
        } else {
          return true;
        }
      });
    }
    _refinement(refinement) {
      return new ZodEffects({
        schema: this,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect: { type: "refinement", refinement }
      });
    }
    superRefine(refinement) {
      return this._refinement(refinement);
    }
    constructor(def) {
      this.spa = this.safeParseAsync;
      this._def = def;
      this.parse = this.parse.bind(this);
      this.safeParse = this.safeParse.bind(this);
      this.parseAsync = this.parseAsync.bind(this);
      this.safeParseAsync = this.safeParseAsync.bind(this);
      this.spa = this.spa.bind(this);
      this.refine = this.refine.bind(this);
      this.refinement = this.refinement.bind(this);
      this.superRefine = this.superRefine.bind(this);
      this.optional = this.optional.bind(this);
      this.nullable = this.nullable.bind(this);
      this.nullish = this.nullish.bind(this);
      this.array = this.array.bind(this);
      this.promise = this.promise.bind(this);
      this.or = this.or.bind(this);
      this.and = this.and.bind(this);
      this.transform = this.transform.bind(this);
      this.brand = this.brand.bind(this);
      this.default = this.default.bind(this);
      this.catch = this.catch.bind(this);
      this.describe = this.describe.bind(this);
      this.pipe = this.pipe.bind(this);
      this.readonly = this.readonly.bind(this);
      this.isNullable = this.isNullable.bind(this);
      this.isOptional = this.isOptional.bind(this);
      this["~standard"] = {
        version: 1,
        vendor: "zod",
        validate: (data) => this["~validate"](data)
      };
    }
    optional() {
      return ZodOptional.create(this, this._def);
    }
    nullable() {
      return ZodNullable.create(this, this._def);
    }
    nullish() {
      return this.nullable().optional();
    }
    array() {
      return ZodArray.create(this);
    }
    promise() {
      return ZodPromise.create(this, this._def);
    }
    or(option) {
      return ZodUnion.create([this, option], this._def);
    }
    and(incoming) {
      return ZodIntersection.create(this, incoming, this._def);
    }
    transform(transform) {
      return new ZodEffects({
        ...processCreateParams(this._def),
        schema: this,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect: { type: "transform", transform }
      });
    }
    default(def) {
      const defaultValueFunc = typeof def === "function" ? def : () => def;
      return new ZodDefault({
        ...processCreateParams(this._def),
        innerType: this,
        defaultValue: defaultValueFunc,
        typeName: ZodFirstPartyTypeKind.ZodDefault
      });
    }
    brand() {
      return new ZodBranded({
        typeName: ZodFirstPartyTypeKind.ZodBranded,
        type: this,
        ...processCreateParams(this._def)
      });
    }
    catch(def) {
      const catchValueFunc = typeof def === "function" ? def : () => def;
      return new ZodCatch({
        ...processCreateParams(this._def),
        innerType: this,
        catchValue: catchValueFunc,
        typeName: ZodFirstPartyTypeKind.ZodCatch
      });
    }
    describe(description) {
      const This = this.constructor;
      return new This({
        ...this._def,
        description
      });
    }
    pipe(target) {
      return ZodPipeline.create(this, target);
    }
    readonly() {
      return ZodReadonly.create(this);
    }
    isOptional() {
      return this.safeParse(void 0).success;
    }
    isNullable() {
      return this.safeParse(null).success;
    }
  }
  const cuidRegex = /^c[^\s-]{8,}$/i;
  const cuid2Regex = /^[0-9a-z]+$/;
  const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
  const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
  const nanoidRegex = /^[a-z0-9_-]{21}$/i;
  const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
  const durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
  const emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
  const _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
  let emojiRegex;
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
  const ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  const ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
  const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  const base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
  const dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
  const dateRegex = new RegExp(`^${dateRegexSource}$`);
  function timeRegexSource(args) {
    let secondsRegexSource = `[0-5]\\d`;
    if (args.precision) {
      secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
    } else if (args.precision == null) {
      secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
    }
    const secondsQuantifier = args.precision ? "+" : "?";
    return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
  }
  function timeRegex(args) {
    return new RegExp(`^${timeRegexSource(args)}$`);
  }
  function datetimeRegex(args) {
    let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
    const opts = [];
    opts.push(args.local ? `Z?` : `Z`);
    if (args.offset)
      opts.push(`([+-]\\d{2}:?\\d{2})`);
    regex = `${regex}(${opts.join("|")})`;
    return new RegExp(`^${regex}$`);
  }
  function isValidIP(ip, version) {
    if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
      return true;
    }
    if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
      return true;
    }
    return false;
  }
  function isValidJWT(jwt, alg) {
    if (!jwtRegex.test(jwt))
      return false;
    try {
      const [header] = jwt.split(".");
      if (!header)
        return false;
      const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
      const decoded = JSON.parse(atob(base64));
      if (typeof decoded !== "object" || decoded === null)
        return false;
      if ("typ" in decoded && decoded?.typ !== "JWT")
        return false;
      if (!decoded.alg)
        return false;
      if (alg && decoded.alg !== alg)
        return false;
      return true;
    } catch {
      return false;
    }
  }
  function isValidCidr(ip, version) {
    if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
      return true;
    }
    if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
      return true;
    }
    return false;
  }
  class ZodString extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = String(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.string) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.string,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      const status = new ParseStatus();
      let ctx = void 0;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          if (input.data.length < check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          if (input.data.length > check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "length") {
          const tooBig = input.data.length > check.value;
          const tooSmall = input.data.length < check.value;
          if (tooBig || tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            if (tooBig) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: check.value,
                type: "string",
                inclusive: true,
                exact: true,
                message: check.message
              });
            } else if (tooSmall) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: check.value,
                type: "string",
                inclusive: true,
                exact: true,
                message: check.message
              });
            }
            status.dirty();
          }
        } else if (check.kind === "email") {
          if (!emailRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "email",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "emoji") {
          if (!emojiRegex) {
            emojiRegex = new RegExp(_emojiRegex, "u");
          }
          if (!emojiRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "emoji",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "uuid") {
          if (!uuidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "uuid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "nanoid") {
          if (!nanoidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "nanoid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cuid") {
          if (!cuidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cuid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cuid2") {
          if (!cuid2Regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cuid2",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "ulid") {
          if (!ulidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "ulid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "url") {
          try {
            new URL(input.data);
          } catch {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "url",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "regex") {
          check.regex.lastIndex = 0;
          const testResult = check.regex.test(input.data);
          if (!testResult) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "regex",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "trim") {
          input.data = input.data.trim();
        } else if (check.kind === "includes") {
          if (!input.data.includes(check.value, check.position)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { includes: check.value, position: check.position },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "toLowerCase") {
          input.data = input.data.toLowerCase();
        } else if (check.kind === "toUpperCase") {
          input.data = input.data.toUpperCase();
        } else if (check.kind === "startsWith") {
          if (!input.data.startsWith(check.value)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { startsWith: check.value },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "endsWith") {
          if (!input.data.endsWith(check.value)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { endsWith: check.value },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "datetime") {
          const regex = datetimeRegex(check);
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "datetime",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "date") {
          const regex = dateRegex;
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "date",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "time") {
          const regex = timeRegex(check);
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "time",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "duration") {
          if (!durationRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "duration",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "ip") {
          if (!isValidIP(input.data, check.version)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "ip",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "jwt") {
          if (!isValidJWT(input.data, check.alg)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "jwt",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cidr") {
          if (!isValidCidr(input.data, check.version)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cidr",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "base64") {
          if (!base64Regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "base64",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "base64url") {
          if (!base64urlRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "base64url",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    _regex(regex, validation, message) {
      return this.refinement((data) => regex.test(data), {
        validation,
        code: ZodIssueCode.invalid_string,
        ...errorUtil.errToObj(message)
      });
    }
    _addCheck(check) {
      return new ZodString({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    email(message) {
      return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
    }
    url(message) {
      return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
    }
    emoji(message) {
      return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
    }
    uuid(message) {
      return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
    }
    nanoid(message) {
      return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
    }
    cuid(message) {
      return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
    }
    cuid2(message) {
      return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
    }
    ulid(message) {
      return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
    }
    base64(message) {
      return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
    }
    base64url(message) {
      return this._addCheck({
        kind: "base64url",
        ...errorUtil.errToObj(message)
      });
    }
    jwt(options) {
      return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
    }
    ip(options) {
      return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
    }
    cidr(options) {
      return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
    }
    datetime(options) {
      if (typeof options === "string") {
        return this._addCheck({
          kind: "datetime",
          precision: null,
          offset: false,
          local: false,
          message: options
        });
      }
      return this._addCheck({
        kind: "datetime",
        precision: typeof options?.precision === "undefined" ? null : options?.precision,
        offset: options?.offset ?? false,
        local: options?.local ?? false,
        ...errorUtil.errToObj(options?.message)
      });
    }
    date(message) {
      return this._addCheck({ kind: "date", message });
    }
    time(options) {
      if (typeof options === "string") {
        return this._addCheck({
          kind: "time",
          precision: null,
          message: options
        });
      }
      return this._addCheck({
        kind: "time",
        precision: typeof options?.precision === "undefined" ? null : options?.precision,
        ...errorUtil.errToObj(options?.message)
      });
    }
    duration(message) {
      return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
    }
    regex(regex, message) {
      return this._addCheck({
        kind: "regex",
        regex,
        ...errorUtil.errToObj(message)
      });
    }
    includes(value, options) {
      return this._addCheck({
        kind: "includes",
        value,
        position: options?.position,
        ...errorUtil.errToObj(options?.message)
      });
    }
    startsWith(value, message) {
      return this._addCheck({
        kind: "startsWith",
        value,
        ...errorUtil.errToObj(message)
      });
    }
    endsWith(value, message) {
      return this._addCheck({
        kind: "endsWith",
        value,
        ...errorUtil.errToObj(message)
      });
    }
    min(minLength, message) {
      return this._addCheck({
        kind: "min",
        value: minLength,
        ...errorUtil.errToObj(message)
      });
    }
    max(maxLength, message) {
      return this._addCheck({
        kind: "max",
        value: maxLength,
        ...errorUtil.errToObj(message)
      });
    }
    length(len, message) {
      return this._addCheck({
        kind: "length",
        value: len,
        ...errorUtil.errToObj(message)
      });
    }
    /**
     * Equivalent to `.min(1)`
     */
    nonempty(message) {
      return this.min(1, errorUtil.errToObj(message));
    }
    trim() {
      return new ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "trim" }]
      });
    }
    toLowerCase() {
      return new ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "toLowerCase" }]
      });
    }
    toUpperCase() {
      return new ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "toUpperCase" }]
      });
    }
    get isDatetime() {
      return !!this._def.checks.find((ch) => ch.kind === "datetime");
    }
    get isDate() {
      return !!this._def.checks.find((ch) => ch.kind === "date");
    }
    get isTime() {
      return !!this._def.checks.find((ch) => ch.kind === "time");
    }
    get isDuration() {
      return !!this._def.checks.find((ch) => ch.kind === "duration");
    }
    get isEmail() {
      return !!this._def.checks.find((ch) => ch.kind === "email");
    }
    get isURL() {
      return !!this._def.checks.find((ch) => ch.kind === "url");
    }
    get isEmoji() {
      return !!this._def.checks.find((ch) => ch.kind === "emoji");
    }
    get isUUID() {
      return !!this._def.checks.find((ch) => ch.kind === "uuid");
    }
    get isNANOID() {
      return !!this._def.checks.find((ch) => ch.kind === "nanoid");
    }
    get isCUID() {
      return !!this._def.checks.find((ch) => ch.kind === "cuid");
    }
    get isCUID2() {
      return !!this._def.checks.find((ch) => ch.kind === "cuid2");
    }
    get isULID() {
      return !!this._def.checks.find((ch) => ch.kind === "ulid");
    }
    get isIP() {
      return !!this._def.checks.find((ch) => ch.kind === "ip");
    }
    get isCIDR() {
      return !!this._def.checks.find((ch) => ch.kind === "cidr");
    }
    get isBase64() {
      return !!this._def.checks.find((ch) => ch.kind === "base64");
    }
    get isBase64url() {
      return !!this._def.checks.find((ch) => ch.kind === "base64url");
    }
    get minLength() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxLength() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
  }
  ZodString.create = (params) => {
    return new ZodString({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodString,
      coerce: params?.coerce ?? false,
      ...processCreateParams(params)
    });
  };
  function floatSafeRemainder(val, step) {
    const valDecCount = (val.toString().split(".")[1] || "").length;
    const stepDecCount = (step.toString().split(".")[1] || "").length;
    const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
    const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
    const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
    return valInt % stepInt / 10 ** decCount;
  }
  class ZodNumber extends ZodType {
    constructor() {
      super(...arguments);
      this.min = this.gte;
      this.max = this.lte;
      this.step = this.multipleOf;
    }
    _parse(input) {
      if (this._def.coerce) {
        input.data = Number(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.number) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.number,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      let ctx = void 0;
      const status = new ParseStatus();
      for (const check of this._def.checks) {
        if (check.kind === "int") {
          if (!util.isInteger(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_type,
              expected: "integer",
              received: "float",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "min") {
          const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
          if (tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "number",
              inclusive: check.inclusive,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
          if (tooBig) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "number",
              inclusive: check.inclusive,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "multipleOf") {
          if (floatSafeRemainder(input.data, check.value) !== 0) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_multiple_of,
              multipleOf: check.value,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "finite") {
          if (!Number.isFinite(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_finite,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    gte(value, message) {
      return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
      return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
      return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
      return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
      return new ZodNumber({
        ...this._def,
        checks: [
          ...this._def.checks,
          {
            kind,
            value,
            inclusive,
            message: errorUtil.toString(message)
          }
        ]
      });
    }
    _addCheck(check) {
      return new ZodNumber({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    int(message) {
      return this._addCheck({
        kind: "int",
        message: errorUtil.toString(message)
      });
    }
    positive(message) {
      return this._addCheck({
        kind: "min",
        value: 0,
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    negative(message) {
      return this._addCheck({
        kind: "max",
        value: 0,
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    nonpositive(message) {
      return this._addCheck({
        kind: "max",
        value: 0,
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    nonnegative(message) {
      return this._addCheck({
        kind: "min",
        value: 0,
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    multipleOf(value, message) {
      return this._addCheck({
        kind: "multipleOf",
        value,
        message: errorUtil.toString(message)
      });
    }
    finite(message) {
      return this._addCheck({
        kind: "finite",
        message: errorUtil.toString(message)
      });
    }
    safe(message) {
      return this._addCheck({
        kind: "min",
        inclusive: true,
        value: Number.MIN_SAFE_INTEGER,
        message: errorUtil.toString(message)
      })._addCheck({
        kind: "max",
        inclusive: true,
        value: Number.MAX_SAFE_INTEGER,
        message: errorUtil.toString(message)
      });
    }
    get minValue() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxValue() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
    get isInt() {
      return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
    }
    get isFinite() {
      let max = null;
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
          return true;
        } else if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        } else if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return Number.isFinite(min) && Number.isFinite(max);
    }
  }
  ZodNumber.create = (params) => {
    return new ZodNumber({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodNumber,
      coerce: params?.coerce || false,
      ...processCreateParams(params)
    });
  };
  class ZodBigInt extends ZodType {
    constructor() {
      super(...arguments);
      this.min = this.gte;
      this.max = this.lte;
    }
    _parse(input) {
      if (this._def.coerce) {
        try {
          input.data = BigInt(input.data);
        } catch {
          return this._getInvalidInput(input);
        }
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.bigint) {
        return this._getInvalidInput(input);
      }
      let ctx = void 0;
      const status = new ParseStatus();
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
          if (tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              type: "bigint",
              minimum: check.value,
              inclusive: check.inclusive,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
          if (tooBig) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              type: "bigint",
              maximum: check.value,
              inclusive: check.inclusive,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "multipleOf") {
          if (input.data % check.value !== BigInt(0)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_multiple_of,
              multipleOf: check.value,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    _getInvalidInput(input) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.bigint,
        received: ctx.parsedType
      });
      return INVALID;
    }
    gte(value, message) {
      return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
      return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
      return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
      return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
      return new ZodBigInt({
        ...this._def,
        checks: [
          ...this._def.checks,
          {
            kind,
            value,
            inclusive,
            message: errorUtil.toString(message)
          }
        ]
      });
    }
    _addCheck(check) {
      return new ZodBigInt({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    positive(message) {
      return this._addCheck({
        kind: "min",
        value: BigInt(0),
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    negative(message) {
      return this._addCheck({
        kind: "max",
        value: BigInt(0),
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    nonpositive(message) {
      return this._addCheck({
        kind: "max",
        value: BigInt(0),
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    nonnegative(message) {
      return this._addCheck({
        kind: "min",
        value: BigInt(0),
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    multipleOf(value, message) {
      return this._addCheck({
        kind: "multipleOf",
        value,
        message: errorUtil.toString(message)
      });
    }
    get minValue() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxValue() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
  }
  ZodBigInt.create = (params) => {
    return new ZodBigInt({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodBigInt,
      coerce: params?.coerce ?? false,
      ...processCreateParams(params)
    });
  };
  class ZodBoolean extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = Boolean(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.boolean) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.boolean,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  }
  ZodBoolean.create = (params) => {
    return new ZodBoolean({
      typeName: ZodFirstPartyTypeKind.ZodBoolean,
      coerce: params?.coerce || false,
      ...processCreateParams(params)
    });
  };
  class ZodDate extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = new Date(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.date) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.date,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      if (Number.isNaN(input.data.getTime())) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_date
        });
        return INVALID;
      }
      const status = new ParseStatus();
      let ctx = void 0;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          if (input.data.getTime() < check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              message: check.message,
              inclusive: true,
              exact: false,
              minimum: check.value,
              type: "date"
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          if (input.data.getTime() > check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              message: check.message,
              inclusive: true,
              exact: false,
              maximum: check.value,
              type: "date"
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return {
        status: status.value,
        value: new Date(input.data.getTime())
      };
    }
    _addCheck(check) {
      return new ZodDate({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    min(minDate, message) {
      return this._addCheck({
        kind: "min",
        value: minDate.getTime(),
        message: errorUtil.toString(message)
      });
    }
    max(maxDate, message) {
      return this._addCheck({
        kind: "max",
        value: maxDate.getTime(),
        message: errorUtil.toString(message)
      });
    }
    get minDate() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min != null ? new Date(min) : null;
    }
    get maxDate() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max != null ? new Date(max) : null;
    }
  }
  ZodDate.create = (params) => {
    return new ZodDate({
      checks: [],
      coerce: params?.coerce || false,
      typeName: ZodFirstPartyTypeKind.ZodDate,
      ...processCreateParams(params)
    });
  };
  class ZodSymbol extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.symbol) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.symbol,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  }
  ZodSymbol.create = (params) => {
    return new ZodSymbol({
      typeName: ZodFirstPartyTypeKind.ZodSymbol,
      ...processCreateParams(params)
    });
  };
  class ZodUndefined extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.undefined) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.undefined,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  }
  ZodUndefined.create = (params) => {
    return new ZodUndefined({
      typeName: ZodFirstPartyTypeKind.ZodUndefined,
      ...processCreateParams(params)
    });
  };
  class ZodNull extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.null) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.null,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  }
  ZodNull.create = (params) => {
    return new ZodNull({
      typeName: ZodFirstPartyTypeKind.ZodNull,
      ...processCreateParams(params)
    });
  };
  class ZodAny extends ZodType {
    constructor() {
      super(...arguments);
      this._any = true;
    }
    _parse(input) {
      return OK(input.data);
    }
  }
  ZodAny.create = (params) => {
    return new ZodAny({
      typeName: ZodFirstPartyTypeKind.ZodAny,
      ...processCreateParams(params)
    });
  };
  class ZodUnknown extends ZodType {
    constructor() {
      super(...arguments);
      this._unknown = true;
    }
    _parse(input) {
      return OK(input.data);
    }
  }
  ZodUnknown.create = (params) => {
    return new ZodUnknown({
      typeName: ZodFirstPartyTypeKind.ZodUnknown,
      ...processCreateParams(params)
    });
  };
  class ZodNever extends ZodType {
    _parse(input) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.never,
        received: ctx.parsedType
      });
      return INVALID;
    }
  }
  ZodNever.create = (params) => {
    return new ZodNever({
      typeName: ZodFirstPartyTypeKind.ZodNever,
      ...processCreateParams(params)
    });
  };
  class ZodVoid extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.undefined) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.void,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  }
  ZodVoid.create = (params) => {
    return new ZodVoid({
      typeName: ZodFirstPartyTypeKind.ZodVoid,
      ...processCreateParams(params)
    });
  };
  class ZodArray extends ZodType {
    _parse(input) {
      const { ctx, status } = this._processInputParams(input);
      const def = this._def;
      if (ctx.parsedType !== ZodParsedType.array) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.array,
          received: ctx.parsedType
        });
        return INVALID;
      }
      if (def.exactLength !== null) {
        const tooBig = ctx.data.length > def.exactLength.value;
        const tooSmall = ctx.data.length < def.exactLength.value;
        if (tooBig || tooSmall) {
          addIssueToContext(ctx, {
            code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
            minimum: tooSmall ? def.exactLength.value : void 0,
            maximum: tooBig ? def.exactLength.value : void 0,
            type: "array",
            inclusive: true,
            exact: true,
            message: def.exactLength.message
          });
          status.dirty();
        }
      }
      if (def.minLength !== null) {
        if (ctx.data.length < def.minLength.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: def.minLength.value,
            type: "array",
            inclusive: true,
            exact: false,
            message: def.minLength.message
          });
          status.dirty();
        }
      }
      if (def.maxLength !== null) {
        if (ctx.data.length > def.maxLength.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: def.maxLength.value,
            type: "array",
            inclusive: true,
            exact: false,
            message: def.maxLength.message
          });
          status.dirty();
        }
      }
      if (ctx.common.async) {
        return Promise.all([...ctx.data].map((item, i) => {
          return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
        })).then((result2) => {
          return ParseStatus.mergeArray(status, result2);
        });
      }
      const result = [...ctx.data].map((item, i) => {
        return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      });
      return ParseStatus.mergeArray(status, result);
    }
    get element() {
      return this._def.type;
    }
    min(minLength, message) {
      return new ZodArray({
        ...this._def,
        minLength: { value: minLength, message: errorUtil.toString(message) }
      });
    }
    max(maxLength, message) {
      return new ZodArray({
        ...this._def,
        maxLength: { value: maxLength, message: errorUtil.toString(message) }
      });
    }
    length(len, message) {
      return new ZodArray({
        ...this._def,
        exactLength: { value: len, message: errorUtil.toString(message) }
      });
    }
    nonempty(message) {
      return this.min(1, message);
    }
  }
  ZodArray.create = (schema, params) => {
    return new ZodArray({
      type: schema,
      minLength: null,
      maxLength: null,
      exactLength: null,
      typeName: ZodFirstPartyTypeKind.ZodArray,
      ...processCreateParams(params)
    });
  };
  function deepPartialify(schema) {
    if (schema instanceof ZodObject) {
      const newShape = {};
      for (const key in schema.shape) {
        const fieldSchema = schema.shape[key];
        newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
      }
      return new ZodObject({
        ...schema._def,
        shape: () => newShape
      });
    } else if (schema instanceof ZodArray) {
      return new ZodArray({
        ...schema._def,
        type: deepPartialify(schema.element)
      });
    } else if (schema instanceof ZodOptional) {
      return ZodOptional.create(deepPartialify(schema.unwrap()));
    } else if (schema instanceof ZodNullable) {
      return ZodNullable.create(deepPartialify(schema.unwrap()));
    } else if (schema instanceof ZodTuple) {
      return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
    } else {
      return schema;
    }
  }
  class ZodObject extends ZodType {
    constructor() {
      super(...arguments);
      this._cached = null;
      this.nonstrict = this.passthrough;
      this.augment = this.extend;
    }
    _getCached() {
      if (this._cached !== null)
        return this._cached;
      const shape = this._def.shape();
      const keys = util.objectKeys(shape);
      this._cached = { shape, keys };
      return this._cached;
    }
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.object) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      const { status, ctx } = this._processInputParams(input);
      const { shape, keys: shapeKeys } = this._getCached();
      const extraKeys = [];
      if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
        for (const key in ctx.data) {
          if (!shapeKeys.includes(key)) {
            extraKeys.push(key);
          }
        }
      }
      const pairs = [];
      for (const key of shapeKeys) {
        const keyValidator = shape[key];
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
      if (this._def.catchall instanceof ZodNever) {
        const unknownKeys = this._def.unknownKeys;
        if (unknownKeys === "passthrough") {
          for (const key of extraKeys) {
            pairs.push({
              key: { status: "valid", value: key },
              value: { status: "valid", value: ctx.data[key] }
            });
          }
        } else if (unknownKeys === "strict") {
          if (extraKeys.length > 0) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.unrecognized_keys,
              keys: extraKeys
            });
            status.dirty();
          }
        } else if (unknownKeys === "strip") ;
        else {
          throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
        }
      } else {
        const catchall = this._def.catchall;
        for (const key of extraKeys) {
          const value = ctx.data[key];
          pairs.push({
            key: { status: "valid", value: key },
            value: catchall._parse(
              new ParseInputLazyPath(ctx, value, ctx.path, key)
              //, ctx.child(key), value, getParsedType(value)
            ),
            alwaysSet: key in ctx.data
          });
        }
      }
      if (ctx.common.async) {
        return Promise.resolve().then(async () => {
          const syncPairs = [];
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            syncPairs.push({
              key,
              value,
              alwaysSet: pair.alwaysSet
            });
          }
          return syncPairs;
        }).then((syncPairs) => {
          return ParseStatus.mergeObjectSync(status, syncPairs);
        });
      } else {
        return ParseStatus.mergeObjectSync(status, pairs);
      }
    }
    get shape() {
      return this._def.shape();
    }
    strict(message) {
      errorUtil.errToObj;
      return new ZodObject({
        ...this._def,
        unknownKeys: "strict",
        ...message !== void 0 ? {
          errorMap: (issue, ctx) => {
            const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
            if (issue.code === "unrecognized_keys")
              return {
                message: errorUtil.errToObj(message).message ?? defaultError
              };
            return {
              message: defaultError
            };
          }
        } : {}
      });
    }
    strip() {
      return new ZodObject({
        ...this._def,
        unknownKeys: "strip"
      });
    }
    passthrough() {
      return new ZodObject({
        ...this._def,
        unknownKeys: "passthrough"
      });
    }
    // const AugmentFactory =
    //   <Def extends ZodObjectDef>(def: Def) =>
    //   <Augmentation extends ZodRawShape>(
    //     augmentation: Augmentation
    //   ): ZodObject<
    //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
    //     Def["unknownKeys"],
    //     Def["catchall"]
    //   > => {
    //     return new ZodObject({
    //       ...def,
    //       shape: () => ({
    //         ...def.shape(),
    //         ...augmentation,
    //       }),
    //     }) as any;
    //   };
    extend(augmentation) {
      return new ZodObject({
        ...this._def,
        shape: () => ({
          ...this._def.shape(),
          ...augmentation
        })
      });
    }
    /**
     * Prior to zod@1.0.12 there was a bug in the
     * inferred type of merged objects. Please
     * upgrade if you are experiencing issues.
     */
    merge(merging) {
      const merged = new ZodObject({
        unknownKeys: merging._def.unknownKeys,
        catchall: merging._def.catchall,
        shape: () => ({
          ...this._def.shape(),
          ...merging._def.shape()
        }),
        typeName: ZodFirstPartyTypeKind.ZodObject
      });
      return merged;
    }
    // merge<
    //   Incoming extends AnyZodObject,
    //   Augmentation extends Incoming["shape"],
    //   NewOutput extends {
    //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
    //       ? Augmentation[k]["_output"]
    //       : k extends keyof Output
    //       ? Output[k]
    //       : never;
    //   },
    //   NewInput extends {
    //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
    //       ? Augmentation[k]["_input"]
    //       : k extends keyof Input
    //       ? Input[k]
    //       : never;
    //   }
    // >(
    //   merging: Incoming
    // ): ZodObject<
    //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
    //   Incoming["_def"]["unknownKeys"],
    //   Incoming["_def"]["catchall"],
    //   NewOutput,
    //   NewInput
    // > {
    //   const merged: any = new ZodObject({
    //     unknownKeys: merging._def.unknownKeys,
    //     catchall: merging._def.catchall,
    //     shape: () =>
    //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
    //     typeName: ZodFirstPartyTypeKind.ZodObject,
    //   }) as any;
    //   return merged;
    // }
    setKey(key, schema) {
      return this.augment({ [key]: schema });
    }
    // merge<Incoming extends AnyZodObject>(
    //   merging: Incoming
    // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
    // ZodObject<
    //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
    //   Incoming["_def"]["unknownKeys"],
    //   Incoming["_def"]["catchall"]
    // > {
    //   // const mergedShape = objectUtil.mergeShapes(
    //   //   this._def.shape(),
    //   //   merging._def.shape()
    //   // );
    //   const merged: any = new ZodObject({
    //     unknownKeys: merging._def.unknownKeys,
    //     catchall: merging._def.catchall,
    //     shape: () =>
    //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
    //     typeName: ZodFirstPartyTypeKind.ZodObject,
    //   }) as any;
    //   return merged;
    // }
    catchall(index) {
      return new ZodObject({
        ...this._def,
        catchall: index
      });
    }
    pick(mask) {
      const shape = {};
      for (const key of util.objectKeys(mask)) {
        if (mask[key] && this.shape[key]) {
          shape[key] = this.shape[key];
        }
      }
      return new ZodObject({
        ...this._def,
        shape: () => shape
      });
    }
    omit(mask) {
      const shape = {};
      for (const key of util.objectKeys(this.shape)) {
        if (!mask[key]) {
          shape[key] = this.shape[key];
        }
      }
      return new ZodObject({
        ...this._def,
        shape: () => shape
      });
    }
    /**
     * @deprecated
     */
    deepPartial() {
      return deepPartialify(this);
    }
    partial(mask) {
      const newShape = {};
      for (const key of util.objectKeys(this.shape)) {
        const fieldSchema = this.shape[key];
        if (mask && !mask[key]) {
          newShape[key] = fieldSchema;
        } else {
          newShape[key] = fieldSchema.optional();
        }
      }
      return new ZodObject({
        ...this._def,
        shape: () => newShape
      });
    }
    required(mask) {
      const newShape = {};
      for (const key of util.objectKeys(this.shape)) {
        if (mask && !mask[key]) {
          newShape[key] = this.shape[key];
        } else {
          const fieldSchema = this.shape[key];
          let newField = fieldSchema;
          while (newField instanceof ZodOptional) {
            newField = newField._def.innerType;
          }
          newShape[key] = newField;
        }
      }
      return new ZodObject({
        ...this._def,
        shape: () => newShape
      });
    }
    keyof() {
      return createZodEnum(util.objectKeys(this.shape));
    }
  }
  ZodObject.create = (shape, params) => {
    return new ZodObject({
      shape: () => shape,
      unknownKeys: "strip",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodObject.strictCreate = (shape, params) => {
    return new ZodObject({
      shape: () => shape,
      unknownKeys: "strict",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodObject.lazycreate = (shape, params) => {
    return new ZodObject({
      shape,
      unknownKeys: "strip",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  class ZodUnion extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const options = this._def.options;
      function handleResults(results) {
        for (const result of results) {
          if (result.result.status === "valid") {
            return result.result;
          }
        }
        for (const result of results) {
          if (result.result.status === "dirty") {
            ctx.common.issues.push(...result.ctx.common.issues);
            return result.result;
          }
        }
        const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union,
          unionErrors
        });
        return INVALID;
      }
      if (ctx.common.async) {
        return Promise.all(options.map(async (option) => {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: []
            },
            parent: null
          };
          return {
            result: await option._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: childCtx
            }),
            ctx: childCtx
          };
        })).then(handleResults);
      } else {
        let dirty = void 0;
        const issues = [];
        for (const option of options) {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: []
            },
            parent: null
          };
          const result = option._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          });
          if (result.status === "valid") {
            return result;
          } else if (result.status === "dirty" && !dirty) {
            dirty = { result, ctx: childCtx };
          }
          if (childCtx.common.issues.length) {
            issues.push(childCtx.common.issues);
          }
        }
        if (dirty) {
          ctx.common.issues.push(...dirty.ctx.common.issues);
          return dirty.result;
        }
        const unionErrors = issues.map((issues2) => new ZodError(issues2));
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union,
          unionErrors
        });
        return INVALID;
      }
    }
    get options() {
      return this._def.options;
    }
  }
  ZodUnion.create = (types, params) => {
    return new ZodUnion({
      options: types,
      typeName: ZodFirstPartyTypeKind.ZodUnion,
      ...processCreateParams(params)
    });
  };
  function mergeValues(a, b) {
    const aType = getParsedType(a);
    const bType = getParsedType(b);
    if (a === b) {
      return { valid: true, data: a };
    } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
      const bKeys = util.objectKeys(b);
      const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
      const newObj = { ...a, ...b };
      for (const key of sharedKeys) {
        const sharedValue = mergeValues(a[key], b[key]);
        if (!sharedValue.valid) {
          return { valid: false };
        }
        newObj[key] = sharedValue.data;
      }
      return { valid: true, data: newObj };
    } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
      if (a.length !== b.length) {
        return { valid: false };
      }
      const newArray = [];
      for (let index = 0; index < a.length; index++) {
        const itemA = a[index];
        const itemB = b[index];
        const sharedValue = mergeValues(itemA, itemB);
        if (!sharedValue.valid) {
          return { valid: false };
        }
        newArray.push(sharedValue.data);
      }
      return { valid: true, data: newArray };
    } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
      return { valid: true, data: a };
    } else {
      return { valid: false };
    }
  }
  class ZodIntersection extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      const handleParsed = (parsedLeft, parsedRight) => {
        if (isAborted(parsedLeft) || isAborted(parsedRight)) {
          return INVALID;
        }
        const merged = mergeValues(parsedLeft.value, parsedRight.value);
        if (!merged.valid) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_intersection_types
          });
          return INVALID;
        }
        if (isDirty(parsedLeft) || isDirty(parsedRight)) {
          status.dirty();
        }
        return { status: status.value, value: merged.data };
      };
      if (ctx.common.async) {
        return Promise.all([
          this._def.left._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          }),
          this._def.right._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          })
        ]).then(([left, right]) => handleParsed(left, right));
      } else {
        return handleParsed(this._def.left._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }), this._def.right._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }));
      }
    }
  }
  ZodIntersection.create = (left, right, params) => {
    return new ZodIntersection({
      left,
      right,
      typeName: ZodFirstPartyTypeKind.ZodIntersection,
      ...processCreateParams(params)
    });
  };
  class ZodTuple extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.array) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.array,
          received: ctx.parsedType
        });
        return INVALID;
      }
      if (ctx.data.length < this._def.items.length) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: this._def.items.length,
          inclusive: true,
          exact: false,
          type: "array"
        });
        return INVALID;
      }
      const rest = this._def.rest;
      if (!rest && ctx.data.length > this._def.items.length) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: this._def.items.length,
          inclusive: true,
          exact: false,
          type: "array"
        });
        status.dirty();
      }
      const items = [...ctx.data].map((item, itemIndex) => {
        const schema = this._def.items[itemIndex] || this._def.rest;
        if (!schema)
          return null;
        return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
      }).filter((x) => !!x);
      if (ctx.common.async) {
        return Promise.all(items).then((results) => {
          return ParseStatus.mergeArray(status, results);
        });
      } else {
        return ParseStatus.mergeArray(status, items);
      }
    }
    get items() {
      return this._def.items;
    }
    rest(rest) {
      return new ZodTuple({
        ...this._def,
        rest
      });
    }
  }
  ZodTuple.create = (schemas, params) => {
    if (!Array.isArray(schemas)) {
      throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
    }
    return new ZodTuple({
      items: schemas,
      typeName: ZodFirstPartyTypeKind.ZodTuple,
      rest: null,
      ...processCreateParams(params)
    });
  };
  class ZodMap extends ZodType {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.map) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.map,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const keyType = this._def.keyType;
      const valueType = this._def.valueType;
      const pairs = [...ctx.data.entries()].map(([key, value], index) => {
        return {
          key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
          value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
        };
      });
      if (ctx.common.async) {
        const finalMap = /* @__PURE__ */ new Map();
        return Promise.resolve().then(async () => {
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            if (key.status === "aborted" || value.status === "aborted") {
              return INVALID;
            }
            if (key.status === "dirty" || value.status === "dirty") {
              status.dirty();
            }
            finalMap.set(key.value, value.value);
          }
          return { status: status.value, value: finalMap };
        });
      } else {
        const finalMap = /* @__PURE__ */ new Map();
        for (const pair of pairs) {
          const key = pair.key;
          const value = pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      }
    }
  }
  ZodMap.create = (keyType, valueType, params) => {
    return new ZodMap({
      valueType,
      keyType,
      typeName: ZodFirstPartyTypeKind.ZodMap,
      ...processCreateParams(params)
    });
  };
  class ZodSet extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.set) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.set,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const def = this._def;
      if (def.minSize !== null) {
        if (ctx.data.size < def.minSize.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: def.minSize.value,
            type: "set",
            inclusive: true,
            exact: false,
            message: def.minSize.message
          });
          status.dirty();
        }
      }
      if (def.maxSize !== null) {
        if (ctx.data.size > def.maxSize.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: def.maxSize.value,
            type: "set",
            inclusive: true,
            exact: false,
            message: def.maxSize.message
          });
          status.dirty();
        }
      }
      const valueType = this._def.valueType;
      function finalizeSet(elements2) {
        const parsedSet = /* @__PURE__ */ new Set();
        for (const element of elements2) {
          if (element.status === "aborted")
            return INVALID;
          if (element.status === "dirty")
            status.dirty();
          parsedSet.add(element.value);
        }
        return { status: status.value, value: parsedSet };
      }
      const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
      if (ctx.common.async) {
        return Promise.all(elements).then((elements2) => finalizeSet(elements2));
      } else {
        return finalizeSet(elements);
      }
    }
    min(minSize, message) {
      return new ZodSet({
        ...this._def,
        minSize: { value: minSize, message: errorUtil.toString(message) }
      });
    }
    max(maxSize, message) {
      return new ZodSet({
        ...this._def,
        maxSize: { value: maxSize, message: errorUtil.toString(message) }
      });
    }
    size(size, message) {
      return this.min(size, message).max(size, message);
    }
    nonempty(message) {
      return this.min(1, message);
    }
  }
  ZodSet.create = (valueType, params) => {
    return new ZodSet({
      valueType,
      minSize: null,
      maxSize: null,
      typeName: ZodFirstPartyTypeKind.ZodSet,
      ...processCreateParams(params)
    });
  };
  class ZodLazy extends ZodType {
    get schema() {
      return this._def.getter();
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const lazySchema = this._def.getter();
      return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
    }
  }
  ZodLazy.create = (getter, params) => {
    return new ZodLazy({
      getter,
      typeName: ZodFirstPartyTypeKind.ZodLazy,
      ...processCreateParams(params)
    });
  };
  class ZodLiteral extends ZodType {
    _parse(input) {
      if (input.data !== this._def.value) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_literal,
          expected: this._def.value
        });
        return INVALID;
      }
      return { status: "valid", value: input.data };
    }
    get value() {
      return this._def.value;
    }
  }
  ZodLiteral.create = (value, params) => {
    return new ZodLiteral({
      value,
      typeName: ZodFirstPartyTypeKind.ZodLiteral,
      ...processCreateParams(params)
    });
  };
  function createZodEnum(values, params) {
    return new ZodEnum({
      values,
      typeName: ZodFirstPartyTypeKind.ZodEnum,
      ...processCreateParams(params)
    });
  }
  class ZodEnum extends ZodType {
    _parse(input) {
      if (typeof input.data !== "string") {
        const ctx = this._getOrReturnCtx(input);
        const expectedValues = this._def.values;
        addIssueToContext(ctx, {
          expected: util.joinValues(expectedValues),
          received: ctx.parsedType,
          code: ZodIssueCode.invalid_type
        });
        return INVALID;
      }
      if (!this._cache) {
        this._cache = new Set(this._def.values);
      }
      if (!this._cache.has(input.data)) {
        const ctx = this._getOrReturnCtx(input);
        const expectedValues = this._def.values;
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_enum_value,
          options: expectedValues
        });
        return INVALID;
      }
      return OK(input.data);
    }
    get options() {
      return this._def.values;
    }
    get enum() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    get Values() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    get Enum() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    extract(values, newDef = this._def) {
      return ZodEnum.create(values, {
        ...this._def,
        ...newDef
      });
    }
    exclude(values, newDef = this._def) {
      return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
        ...this._def,
        ...newDef
      });
    }
  }
  ZodEnum.create = createZodEnum;
  class ZodNativeEnum extends ZodType {
    _parse(input) {
      const nativeEnumValues = util.getValidEnumValues(this._def.values);
      const ctx = this._getOrReturnCtx(input);
      if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
        const expectedValues = util.objectValues(nativeEnumValues);
        addIssueToContext(ctx, {
          expected: util.joinValues(expectedValues),
          received: ctx.parsedType,
          code: ZodIssueCode.invalid_type
        });
        return INVALID;
      }
      if (!this._cache) {
        this._cache = new Set(util.getValidEnumValues(this._def.values));
      }
      if (!this._cache.has(input.data)) {
        const expectedValues = util.objectValues(nativeEnumValues);
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_enum_value,
          options: expectedValues
        });
        return INVALID;
      }
      return OK(input.data);
    }
    get enum() {
      return this._def.values;
    }
  }
  ZodNativeEnum.create = (values, params) => {
    return new ZodNativeEnum({
      values,
      typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
      ...processCreateParams(params)
    });
  };
  class ZodPromise extends ZodType {
    unwrap() {
      return this._def.type;
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.promise,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
      return OK(promisified.then((data) => {
        return this._def.type.parseAsync(data, {
          path: ctx.path,
          errorMap: ctx.common.contextualErrorMap
        });
      }));
    }
  }
  ZodPromise.create = (schema, params) => {
    return new ZodPromise({
      type: schema,
      typeName: ZodFirstPartyTypeKind.ZodPromise,
      ...processCreateParams(params)
    });
  };
  class ZodEffects extends ZodType {
    innerType() {
      return this._def.schema;
    }
    sourceType() {
      return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      const effect = this._def.effect || null;
      const checkCtx = {
        addIssue: (arg) => {
          addIssueToContext(ctx, arg);
          if (arg.fatal) {
            status.abort();
          } else {
            status.dirty();
          }
        },
        get path() {
          return ctx.path;
        }
      };
      checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
      if (effect.type === "preprocess") {
        const processed = effect.transform(ctx.data, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(processed).then(async (processed2) => {
            if (status.value === "aborted")
              return INVALID;
            const result = await this._def.schema._parseAsync({
              data: processed2,
              path: ctx.path,
              parent: ctx
            });
            if (result.status === "aborted")
              return INVALID;
            if (result.status === "dirty")
              return DIRTY(result.value);
            if (status.value === "dirty")
              return DIRTY(result.value);
            return result;
          });
        } else {
          if (status.value === "aborted")
            return INVALID;
          const result = this._def.schema._parseSync({
            data: processed,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        }
      }
      if (effect.type === "refinement") {
        const executeRefinement = (acc) => {
          const result = effect.refinement(acc, checkCtx);
          if (ctx.common.async) {
            return Promise.resolve(result);
          }
          if (result instanceof Promise) {
            throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
          }
          return acc;
        };
        if (ctx.common.async === false) {
          const inner = this._def.schema._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          executeRefinement(inner.value);
          return { status: status.value, value: inner.value };
        } else {
          return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
            if (inner.status === "aborted")
              return INVALID;
            if (inner.status === "dirty")
              status.dirty();
            return executeRefinement(inner.value).then(() => {
              return { status: status.value, value: inner.value };
            });
          });
        }
      }
      if (effect.type === "transform") {
        if (ctx.common.async === false) {
          const base = this._def.schema._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (!isValid(base))
            return INVALID;
          const result = effect.transform(base.value, checkCtx);
          if (result instanceof Promise) {
            throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
          }
          return { status: status.value, value: result };
        } else {
          return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
            if (!isValid(base))
              return INVALID;
            return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
              status: status.value,
              value: result
            }));
          });
        }
      }
      util.assertNever(effect);
    }
  }
  ZodEffects.create = (schema, effect, params) => {
    return new ZodEffects({
      schema,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect,
      ...processCreateParams(params)
    });
  };
  ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
    return new ZodEffects({
      schema,
      effect: { type: "preprocess", transform: preprocess },
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      ...processCreateParams(params)
    });
  };
  class ZodOptional extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType === ZodParsedType.undefined) {
        return OK(void 0);
      }
      return this._def.innerType._parse(input);
    }
    unwrap() {
      return this._def.innerType;
    }
  }
  ZodOptional.create = (type, params) => {
    return new ZodOptional({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodOptional,
      ...processCreateParams(params)
    });
  };
  class ZodNullable extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType === ZodParsedType.null) {
        return OK(null);
      }
      return this._def.innerType._parse(input);
    }
    unwrap() {
      return this._def.innerType;
    }
  }
  ZodNullable.create = (type, params) => {
    return new ZodNullable({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodNullable,
      ...processCreateParams(params)
    });
  };
  class ZodDefault extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      let data = ctx.data;
      if (ctx.parsedType === ZodParsedType.undefined) {
        data = this._def.defaultValue();
      }
      return this._def.innerType._parse({
        data,
        path: ctx.path,
        parent: ctx
      });
    }
    removeDefault() {
      return this._def.innerType;
    }
  }
  ZodDefault.create = (type, params) => {
    return new ZodDefault({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodDefault,
      defaultValue: typeof params.default === "function" ? params.default : () => params.default,
      ...processCreateParams(params)
    });
  };
  class ZodCatch extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const newCtx = {
        ...ctx,
        common: {
          ...ctx.common,
          issues: []
        }
      };
      const result = this._def.innerType._parse({
        data: newCtx.data,
        path: newCtx.path,
        parent: {
          ...newCtx
        }
      });
      if (isAsync(result)) {
        return result.then((result2) => {
          return {
            status: "valid",
            value: result2.status === "valid" ? result2.value : this._def.catchValue({
              get error() {
                return new ZodError(newCtx.common.issues);
              },
              input: newCtx.data
            })
          };
        });
      } else {
        return {
          status: "valid",
          value: result.status === "valid" ? result.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      }
    }
    removeCatch() {
      return this._def.innerType;
    }
  }
  ZodCatch.create = (type, params) => {
    return new ZodCatch({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodCatch,
      catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
      ...processCreateParams(params)
    });
  };
  class ZodNaN extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.nan) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.nan,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return { status: "valid", value: input.data };
    }
  }
  ZodNaN.create = (params) => {
    return new ZodNaN({
      typeName: ZodFirstPartyTypeKind.ZodNaN,
      ...processCreateParams(params)
    });
  };
  class ZodBranded extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const data = ctx.data;
      return this._def.type._parse({
        data,
        path: ctx.path,
        parent: ctx
      });
    }
    unwrap() {
      return this._def.type;
    }
  }
  class ZodPipeline extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.common.async) {
        const handleAsync = async () => {
          const inResult = await this._def.in._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inResult.status === "aborted")
            return INVALID;
          if (inResult.status === "dirty") {
            status.dirty();
            return DIRTY(inResult.value);
          } else {
            return this._def.out._parseAsync({
              data: inResult.value,
              path: ctx.path,
              parent: ctx
            });
          }
        };
        return handleAsync();
      } else {
        const inResult = this._def.in._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return {
            status: "dirty",
            value: inResult.value
          };
        } else {
          return this._def.out._parseSync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      }
    }
    static create(a, b) {
      return new ZodPipeline({
        in: a,
        out: b,
        typeName: ZodFirstPartyTypeKind.ZodPipeline
      });
    }
  }
  class ZodReadonly extends ZodType {
    _parse(input) {
      const result = this._def.innerType._parse(input);
      const freeze = (data) => {
        if (isValid(data)) {
          data.value = Object.freeze(data.value);
        }
        return data;
      };
      return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
    }
    unwrap() {
      return this._def.innerType;
    }
  }
  ZodReadonly.create = (type, params) => {
    return new ZodReadonly({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodReadonly,
      ...processCreateParams(params)
    });
  };
  var ZodFirstPartyTypeKind;
  (function(ZodFirstPartyTypeKind2) {
    ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
    ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
    ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
    ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
    ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
    ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
    ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
    ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
    ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
    ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
    ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
    ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
    ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
    ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
    ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
    ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
    ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
    ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
    ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
    ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
    ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
    ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
    ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
    ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
    ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
    ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
    ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
    ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
    ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
    ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
    ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
    ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
    ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
    ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
    ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
    ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
  })(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
  const stringType = ZodString.create;
  const numberType = ZodNumber.create;
  const booleanType = ZodBoolean.create;
  ZodNever.create;
  const arrayType = ZodArray.create;
  const objectType = ZodObject.create;
  ZodUnion.create;
  ZodIntersection.create;
  ZodTuple.create;
  const enumType = ZodEnum.create;
  ZodPromise.create;
  ZodOptional.create;
  ZodNullable.create;
  const SUPPORTED_LANGUAGES = ["it", "en", "fr", "es", "de", "ja", "pt-BR", "id"];
  const WIDGET_LANGUAGES = SUPPORTED_LANGUAGES;
  objectType({
    heightCm: numberType().min(100).max(220),
    weightKg: numberType().min(30).max(250).optional(),
    bustCm: numberType().min(50).max(200),
    waistCm: numberType().min(50).max(200),
    hipsCm: numberType().min(50).max(200),
    /** Lunghezza del piede in cm, per le scarpe (05/09/2026). Opzionale: se
     *  manca, il widget la stima dall'altezza. */
    footCm: numberType().min(15).max(40).optional()
  });
  objectType({
    apiKey: stringType().min(1),
    primaryColor: stringType().regex(/^#[0-9A-Fa-f]{6}$/),
    buttonText: stringType().min(1).max(30),
    enabledCategories: arrayType(stringType()),
    defaultLanguage: enumType(WIDGET_LANGUAGES).default("en")
  });
  const SizeTableCategorySchema = enumType(["top", "bottom", "dress", "outerwear", "footwear"]);
  const SizeTableRowSchema = objectType({
    size: stringType().min(1, "La taglia è obbligatoria").max(20),
    heightMin: numberType().int().min(0).max(300),
    heightMax: numberType().int().min(0).max(300),
    bustMin: numberType().int().min(0).max(300),
    bustMax: numberType().int().min(0).max(300),
    waistMin: numberType().int().min(0).max(300),
    waistMax: numberType().int().min(0).max(300),
    hipsMin: numberType().int().min(0).max(300),
    hipsMax: numberType().int().min(0).max(300),
    /** Lunghezza del piede (cm) per le scarpe: opzionale, con i decimali —
     *  una misura di scarpa vale ~0,67 cm, un intero non basta. Assenti o
     *  [0,0] = non dichiarata, come le altre dimensioni. */
    footMin: numberType().min(0).max(60).optional(),
    footMax: numberType().min(0).max(60).optional()
  }).refine((r) => (r.footMin ?? 0) <= (r.footMax ?? 0), {
    message: "footMin deve essere <= footMax",
    path: ["footMin"]
  }).refine((r) => r.heightMin <= r.heightMax, {
    message: "heightMin deve essere <= heightMax",
    path: ["heightMin"]
  }).refine((r) => r.bustMin <= r.bustMax, {
    message: "bustMin deve essere <= bustMax",
    path: ["bustMin"]
  }).refine((r) => r.waistMin <= r.waistMax, {
    message: "waistMin deve essere <= waistMax",
    path: ["waistMin"]
  }).refine((r) => r.hipsMin <= r.hipsMax, {
    message: "hipsMin deve essere <= hipsMax",
    path: ["hipsMin"]
  });
  const SizeTableDataSchema = arrayType(SizeTableRowSchema).min(1, "La tabella deve contenere almeno una riga").max(100, "Massimo 100 righe per tabella");
  objectType({
    name: stringType().min(1).max(100),
    data: SizeTableDataSchema,
    category: SizeTableCategorySchema.nullable().optional()
  });
  enumType(["front", "right", "back", "left"]);
  const PRODUCT_URL_MAX_LENGTH = 2048;
  const ProductPageUrlSchema = stringType({ required_error: "productPageUrl mancante" }).trim().min(1, "productPageUrl mancante").max(PRODUCT_URL_MAX_LENGTH, "productPageUrl troppo lungo");
  objectType({
    productPageUrl: ProductPageUrlSchema
  });
  const PhotoConsentSchema = objectType({
    given: booleanType(),
    version: numberType().int().positive()
  });
  enumType(["tops", "bottoms", "one-pieces", "auto"]);
  const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|yclid$|msclkid$|mc_eid$|mc_cid$|_ga$)/i;
  function tryParseUrl(s) {
    try {
      return new URL(s);
    } catch {
      return null;
    }
  }
  function rawFallback(trimmed) {
    return trimmed.toLowerCase().replace(/#.*$/, "").replace(/\/+$/, "");
  }
  function normalizeProductUrl(rawUrl) {
    const trimmed = (rawUrl ?? "").trim();
    let u = tryParseUrl(trimmed);
    if (!u) {
      const withScheme = tryParseUrl(`https://${trimmed}`);
      if (withScheme && withScheme.hostname.includes(".")) {
        u = withScheme;
      } else {
        return rawFallback(trimmed);
      }
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return rawFallback(trimmed);
    }
    const host = u.host.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const query = new URLSearchParams(params).toString();
    return `https://${host}${path}${query ? `?${query}` : ""}`;
  }
  const BUTTON_ANCHOR_ROWS = [
    // Shopify — form del carrello e blocco pulsanti dei temi moderni
    { selector: ".product-form__buttons", platform: "Shopify" },
    { selector: 'form[action*="/cart/add"] .product-form__submit', platform: "Shopify" },
    { selector: 'form[action*="/cart/add"]', platform: "Shopify" },
    { selector: "form.cart", platform: "WooCommerce" },
    { selector: ".single_add_to_cart_button", platform: "WooCommerce" },
    { selector: ".product-add-to-cart", platform: "PrestaShop" },
    { selector: "#add-to-cart-or-refresh", platform: "PrestaShop" }
  ];
  const BUTTON_ANCHORS = BUTTON_ANCHOR_ROWS.map((r) => r.selector);
  const BUTTON_TARGET_ATTR = "data-cabina-target";
  const AUTO_OPEN_PARAM = "cabina";
  const AUTO_OPEN_VALUE = "prova";
  const PRODUCT_IMAGE_ROWS = [
    // Wix Stores (06/09/2026): il data-hook della foto principale della PDP. Serve
    // anche allo stage automatico della prova (vedi tryon-overlay `creaStageSullaFoto`).
    { selector: '[data-hook="ProductImageDataHook.ProductImage"]', platform: "Wix" },
    { selector: ".woocommerce-product-gallery__image img", platform: "WooCommerce" },
    { selector: "img.wp-post-image", platform: "WooCommerce" },
    { selector: ".wp-block-woocommerce-product-image img", platform: "WooCommerce" },
    { selector: ".product__image img", platform: "Shopify" },
    { selector: ".product-image img", platform: "Shopify" },
    { selector: ".product-photo img", platform: "Shopify" },
    { selector: ".product-single__photo img", platform: "Shopify" },
    { selector: "[data-product-image] img", platform: "Shopify" },
    { selector: ".product-featured-image img", platform: "Shopify" },
    { selector: ".product-gallery img", platform: "Shopify" },
    { selector: ".product-img img", platform: "Shopify" },
    { selector: ".product__media img", platform: "Shopify" },
    { selector: ".main-product-image img", platform: "Shopify" }
  ];
  const PRODUCT_IMAGE_SELECTORS = PRODUCT_IMAGE_ROWS.map((r) => r.selector);
  const ADD_TO_CART_ROWS = [
    { selector: 'form[action*="/cart/add"] [type="submit"]', platform: "Shopify" },
    { selector: ".product-form__submit", platform: "Shopify" },
    { selector: ".single_add_to_cart_button", platform: "WooCommerce" },
    { selector: '[data-button-action="add-to-cart"]', platform: "PrestaShop" }
  ];
  const ADD_TO_CART_SELECTORS = ADD_TO_CART_ROWS.map((r) => r.selector);
  async function fetchWithTimeout(url, options = {}, timeoutMs = 1e4) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  async function fetchWidgetConfig(apiKey2, baseUrl = "") {
    try {
      const sanitizedBase = baseUrl.replace(/\/+$/, "");
      const url = `${sanitizedBase}/api/widget/config?api_key=${encodeURIComponent(apiKey2)}`;
      const res = await fetchWithTimeout(url);
      const body = await res.json().catch((err) => {
        if (err instanceof SyntaxError) {
          console.error("[widget] error=INVALID_JSON");
        }
        throw err;
      });
      if (!res.ok || body.error) {
        console.error(`[widget] error=${body.error?.code ?? "INTERNAL_ERROR"}`);
        return null;
      }
      if (!body.data) {
        console.error("[widget] error=INTERNAL_ERROR");
        return null;
      }
      return body.data;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error("[widget] error=TIMEOUT");
      } else if (!(err instanceof SyntaxError)) {
        console.error("[widget] error=INTERNAL_ERROR");
      }
      return null;
    }
  }
  async function fetchSizeTables(apiKey2, baseUrl = "") {
    try {
      const sanitizedBase = baseUrl.replace(/\/+$/, "");
      const url = `${sanitizedBase}/api/widget/size-tables?api_key=${encodeURIComponent(apiKey2)}`;
      const res = await fetchWithTimeout(url);
      const body = await res.json().catch((err) => {
        if (err instanceof SyntaxError) {
          console.error("[widget] error=INVALID_JSON");
        }
        throw err;
      });
      if (!res.ok || body.error) {
        console.error(`[widget] error=${body.error?.code ?? "INTERNAL_ERROR"}`);
        return null;
      }
      return body.data ?? [];
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error("[widget] error=TIMEOUT");
      } else if (!(err instanceof SyntaxError)) {
        console.error("[widget] error=INTERNAL_ERROR");
      }
      return null;
    }
  }
  async function estimateMeasuresFromPhoto(apiKey2, photoDataUrl, baseUrl = "") {
    try {
      const sanitizedBase = baseUrl.replace(/\/+$/, "");
      const url = `${sanitizedBase}/api/widget/estimate-measures`;
      const colonIdx = photoDataUrl.indexOf(",");
      const base64 = colonIdx !== -1 ? photoDataUrl.slice(colonIdx + 1) : photoDataUrl;
      const mimeMatch = photoDataUrl.match(/data:(image\/[\w+]+)/);
      const mimeType = mimeMatch?.[1] ?? "image/jpeg";
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ api_key: apiKey2, photo: base64, mimeType })
        },
        15e3
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        console.error(`[cabina] estimate-measures HTTP ${res.status}`, body?.error ?? "");
        return {};
      }
      if (body?.error) {
        console.error("[cabina] estimate-measures errore", body.error);
        if (body.error.code === VISION_UNAVAILABLE_ERROR) throw new Error(VISION_UNAVAILABLE_ERROR);
        return {};
      }
      return body?.data ?? {};
    } catch (e) {
      if (e instanceof Error && e.message === VISION_UNAVAILABLE_ERROR) throw e;
      if (e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")) {
        console.error("[cabina] estimate-measures: nessuna risposta entro il timeout del client");
        throw new Error(VISION_UNAVAILABLE_ERROR);
      }
      return {};
    }
  }
  async function analyzeGarmentFromUrl(apiKey2, productImageUrl, baseUrl = "") {
    try {
      const sanitizedBase = baseUrl.replace(/\/+$/, "");
      const url = `${sanitizedBase}/api/widget/analyze-garment`;
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ api_key: apiKey2, productImageUrl })
        },
        // ⚠️ 2026-07-30 — erano 3_000, e il client abortiva SEMPRE: misurato in
        // produzione, la route risponde in 3,7-8,5s perché scarica l'immagine dal
        // CDN del negozio e poi interroga il modello vision. Il valore andava bene
        // finché l'analisi era spenta e tornava `unknown` in mezzo secondo: appena
        // ha iniziato a funzionare davvero, il timeout del client l'ha resa
        // inutile — `catch → return null`, categoria `auto`, FASHN di nuovo a
        // indovinare. Allineato a `estimateMeasuresFromPhoto`, che chiama lo
        // stesso backend vision con gli stessi tempi. Non blocca nulla:
        // l'analisi parte al DOMContentLoaded e serve solo al click sul try-on.
        15e3
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data) return null;
      return body.data;
    } catch {
      return null;
    }
  }
  async function fetchCatalog(apiKey2, baseUrl = "") {
    try {
      const sanitizedBase = baseUrl.replace(/\/+$/, "");
      const url = `${sanitizedBase}/api/widget/catalog`;
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ api_key: apiKey2 })
        },
        5e3
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data) return null;
      return body.data;
    } catch {
      return null;
    }
  }
  async function tryonGenerative(apiKey2, baseUrl, modelImageData, garments, productPageUrl, identity) {
    try {
      const sanitizedBase = baseUrl.replace(/\/+$/, "");
      const url = `${sanitizedBase}/api/widget/tryon-generative`;
      const timeoutMs = 1e5 + 25e3 * Math.max(0, garments.length - 1);
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({
            api_key: apiKey2,
            modelImageData,
            // ⚠️ 2026-07-26 — `SelectedGarment` usa `imageUrl`, ma lo schema della
            // route vuole `url`: serializzare l'array com'era faceva rispondere
            // `VALIDATION_ERROR: Required` a OGNI richiesta, quindi il try-on
            // generativo non è mai riuscito da quando 12.3 ha introdotto l'array
            // (prima il campo era un singolo `garmentImageUrl`). Il widget tratta
            // ogni errore come fallback silenzioso verso l'overlay, per questo il
            // guasto non si è mai visto da fuori. Mappare qui, non rinominare il
            // campo nello stato: `imageUrl` è il nome usato in tutto il widget.
            // 2026-08-09 — anche `removeExisting` passa com'è: quando è undefined
            // JSON.stringify fa sparire la chiave e la route applica il default
            // retrocompatibile (regola legacy lato rendering).
            // 2026-08-12 — anche `garmentPhotoType` passa com'è: undefined sparisce,
            // e la route applica il default "auto".
            garments: garments.map((g) => ({
              url: g.imageUrl,
              category: g.category,
              removeExisting: g.removeExisting,
              garmentPhotoType: g.garmentPhotoType
            })),
            productPageUrl: normalizeProductUrl(productPageUrl),
            photoSource: identity.photoSource,
            // undefined → la chiave sparisce dal JSON, come `removeExisting`.
            consentVersion: identity.consentVersion
          })
        },
        timeoutMs
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.error || !body?.data) {
        const quota = body?.error?.code === "GENERATIVE_QUOTA_EXCEEDED";
        return { ok: false, reason: quota ? "quota" : "technical" };
      }
      return { ok: true, ...body.data };
    } catch {
      return { ok: false, reason: "technical" };
    }
  }
  function sendTryonReport(apiKey2, baseUrl, resultId, reason) {
    const sanitizedBase = baseUrl.replace(/\/+$/, "");
    const url = `${sanitizedBase}/api/widget/tryon-report`;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      keepalive: true,
      body: JSON.stringify({
        api_key: apiKey2,
        resultId: resultId ?? null,
        reason: null
      })
    }).catch(() => {
    });
  }
  function notifySessionComplete(apiKey2, baseUrl, sessionId) {
    const sanitizedBase = baseUrl.replace(/\/+$/, "");
    const url = `${sanitizedBase}/api/widget/session/complete`;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      keepalive: true,
      body: JSON.stringify({
        api_key: apiKey2,
        session_id: sessionId
      })
    }).catch(() => {
    });
  }
  function randomSessionRef() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch {
    }
    return `sref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  function sendConsentEvent(apiKey2, baseUrl, payload) {
    const sanitizedBase = baseUrl.replace(/\/+$/, "");
    const url = `${sanitizedBase}/api/widget/consent-event`;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      keepalive: true,
      body: JSON.stringify({
        api_key: apiKey2,
        sessionRef: randomSessionRef(),
        consentVersion: payload.consentVersion,
        eventType: payload.eventType
      })
    }).catch(() => {
    });
  }
  async function notifySessionStart(apiKey2, baseUrl = "") {
    try {
      const sanitizedBase = baseUrl.replace(/\/+$/, "");
      const url = `${sanitizedBase}/api/widget/session`;
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ api_key: apiKey2 })
        },
        1e4
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.error) {
        const code = body?.error?.code ?? "INTERNAL_ERROR";
        console.error(`[widget] error=${code}`);
        return { ok: false, errorCode: code };
      }
      return { ok: true, sessionId: body?.data?.session_id };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error("[widget] error=TIMEOUT");
      } else {
        console.error("[widget] error=INTERNAL_ERROR");
      }
      return { ok: false, errorCode: "INTERNAL_ERROR" };
    }
  }
  const localeCache = /* @__PURE__ */ new Map();
  const inFlightLocales = /* @__PURE__ */ new Map();
  let currentLocale = null;
  let currentLocaleLang = null;
  function linguaDelWidget(tag) {
    const primary = tag.split("-")[0]?.toLowerCase() ?? "";
    if (primary === "pt") return "pt-BR";
    if (primary === "in") return "id";
    return WIDGET_LANGUAGES.includes(primary) ? primary : null;
  }
  function resolveLanguage(defaultLanguage) {
    if (typeof document !== "undefined" && document.documentElement) {
      const docLang = document.documentElement.lang;
      if (docLang) {
        const lingua = linguaDelWidget(docLang);
        if (lingua) return lingua;
      }
    }
    if (typeof navigator !== "undefined") {
      const navLang = navigator.language;
      if (navLang) {
        const lingua = linguaDelWidget(navLang);
        if (lingua) return lingua;
      }
    }
    if (WIDGET_LANGUAGES.includes(defaultLanguage)) return defaultLanguage;
    return "en";
  }
  async function loadLocale(lang, baseUrl) {
    const cached = localeCache.get(lang);
    if (cached) {
      currentLocale = cached;
      currentLocaleLang = lang;
      return cached;
    }
    const inflight = inFlightLocales.get(lang);
    if (inflight) return inflight;
    const fallbackEn = () => {
      if (lang !== "en") return loadLocale("en", baseUrl);
      return Promise.reject(new Error("Cannot load any locale"));
    };
    const promise = (async () => {
      try {
        const sanitizedBase = baseUrl.replace(/\/+$/, "");
        const url = `${sanitizedBase}/locales/${lang}.json`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5e3);
        let res;
        try {
          res = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) return fallbackEn();
        const dict = await res.json();
        localeCache.set(lang, dict);
        currentLocale = dict;
        currentLocaleLang = lang;
        return dict;
      } catch {
        return fallbackEn();
      }
    })();
    inFlightLocales.set(lang, promise);
    return promise.finally(() => inFlightLocales.delete(lang));
  }
  function getCurrentLanguage() {
    return currentLocaleLang;
  }
  function getLocaleStringOr(key, fallbackKey, vars) {
    const value = getLocaleString(key, vars);
    return value === key ? getLocaleString(fallbackKey, vars) : value;
  }
  function getLocaleString(key, vars) {
    if (!currentLocale) return key;
    const keys = key.split(".");
    let value = currentLocale;
    for (const k of keys) {
      if (value == null || typeof value !== "object") return key;
      value = value[k];
    }
    if (typeof value !== "string") return key;
    if (vars) {
      return value.replace(
        /\{\{(\w+)\}\}/g,
        (_, varKey) => vars[varKey] ?? `{{${varKey}}}`
      );
    }
    return value;
  }
  function widgetReducer(context, event) {
    switch (context.state) {
      case "idle":
        if (event.type === "OPEN") return { ...context, state: "photo" };
        return context;
      case "photo":
        if (event.type === "PHOTO_UPLOADED") return { ...context, state: "form", photoData: event.dataUrl, identityMode: "user_photo", error: null };
        if (event.type === "PHOTO_CAPTURED") return { ...context, state: "form", photoData: event.dataUrl, identityMode: "user_photo", error: null };
        if (event.type === "PRESET_MODEL_SELECTED") return {
          ...context,
          // Proposta (a) 2026-07-31: il percorso modella ora PASSA dal `form`
          // misure (auto-rilevamento dalla foto della modella + conferma
          // dell'acquirente), così la raccomandazione taglia è disponibile anche
          // "senza foto". Prima saltava il form (Task 2.5) → niente consiglio.
          state: "form",
          photoData: event.dataUrl,
          identityMode: "preset_model",
          // Form fresco: le misure le popolano l'auto-rilevamento sulla foto
          // modella e gli edit dell'acquirente. Anchor azzerati fino alla stima.
          measures: null,
          measureSource: null,
          error: null
        };
        if (event.type === "PHOTO_RETRY") return { ...context, state: "photo", photoData: null, identityMode: null, error: null };
        if (event.type === "CLOSE") return { ...context, state: "closed" };
        return context;
      case "form":
        if (event.type === "MEASURES_CONFIRMED") {
          const base = { ...context, measures: event.measures, measureSource: event.measureSource ?? "manual", fit: event.fit ?? "regular" };
          return event.garments && event.garments.length > 0 ? { ...base, state: "rendering", selectedGarments: event.garments, error: null } : { ...base, state: "garment_select" };
        }
        if (event.type === "BACK") return { ...context, state: "photo", photoData: null, identityMode: null, error: null };
        if (event.type === "CLOSE") return { ...context, state: "closed" };
        return context;
      case "garment_select":
        if (event.type === "GARMENTS_CONFIRMED") return { ...context, state: "rendering", selectedGarments: event.garments, error: null };
        if (event.type === "BACK") return { ...context, state: "form", error: null };
        if (event.type === "CLOSE") return { ...context, state: "closed" };
        return context;
      case "rendering":
        if (event.type === "RENDER_SUCCESS") return { ...context, state: "tryon", renderResult: event.results, currentAngle: 0, error: null };
        if (event.type === "RENDER_ERROR") return { ...context, state: "form", error: event.error };
        return context;
      case "tryon":
        if (event.type === "ANGLE_CHANGED") return { ...context, currentAngle: event.angle };
        if (event.type === "BACK") return { ...context, state: "garment_select", error: null };
        if (event.type === "CLOSE") return { ...context, state: "closed" };
        return context;
      default:
        return context;
    }
  }
  function createInitialContext() {
    return { state: "idle", error: null, renderResult: null, photoData: null, measures: null, baseUrl: "", currentAngle: 0, recommendedSize: null, measureSource: null, identityMode: null, selectedGarments: null };
  }
  function resetSessionContext(prev) {
    return { ...createInitialContext(), baseUrl: prev.baseUrl };
  }
  function parseBrowser(ua) {
    let name = "unknown";
    let version = 0;
    let isMobile = false;
    const uaLower = ua.toLowerCase();
    if (/mobi|android|iphone|ipad/i.test(uaLower)) {
      isMobile = true;
    }
    const edgeMatch = /edg(?:e|a|ios)?\/(\d+)/i.exec(uaLower);
    if (edgeMatch) {
      name = "edge";
      version = parseInt(edgeMatch[1], 10);
      return { name, version, isMobile };
    }
    const chromeMatch = /(?:chrome|crios)\/(\d+)/i.exec(uaLower);
    if (chromeMatch && !/opr|opera/i.test(uaLower)) {
      name = "chrome";
      version = parseInt(chromeMatch[1], 10);
      return { name, version, isMobile };
    }
    const firefoxMatch = /(?:firefox|fxios)\/(\d+)/i.exec(uaLower);
    if (firefoxMatch) {
      name = "firefox";
      version = parseInt(firefoxMatch[1], 10);
      return { name, version, isMobile };
    }
    const safariMatch = /version\/(\d+).*safari/i.exec(uaLower);
    if (safariMatch && !/chrome|crios|edg/i.test(uaLower)) {
      name = "safari";
      version = parseInt(safariMatch[1], 10);
      return { name, version, isMobile };
    }
    return { name, version, isMobile };
  }
  const MIN_VERSIONS = {
    chrome: { desktop: 120, mobile: 100 },
    firefox: { desktop: 120, mobile: 120 },
    safari: { desktop: 17, mobile: 16 },
    edge: { desktop: 120, mobile: 100 }
  };
  function isBrowserSupported() {
    if (typeof navigator === "undefined") return true;
    const { name, version, isMobile } = parseBrowser(navigator.userAgent);
    const minVersions = MIN_VERSIONS[name];
    if (!minVersions) return true;
    const min = isMobile ? minVersions.mobile : minVersions.desktop;
    return version >= min;
  }
  const BROWSER_UPDATE_URLS = {
    chrome: "https://www.google.com/chrome/",
    firefox: "https://www.mozilla.org/firefox/",
    safari: "https://support.apple.com/safari",
    edge: "https://www.microsoft.com/edge",
    unknown: "https://browsehappy.com/"
  };
  function getBrowserUpdateLink() {
    if (typeof navigator === "undefined") return BROWSER_UPDATE_URLS.unknown;
    const { name } = parseBrowser(navigator.userAgent);
    return BROWSER_UPDATE_URLS[name] ?? BROWSER_UPDATE_URLS.unknown;
  }
  function extractProductImageUrl() {
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage?.content) {
      const url = resolveUrl(ogImage.content);
      if (url) return url;
    }
    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    if (twitterImage?.content) {
      const url = resolveUrl(twitterImage.content);
      if (url) return url;
    }
    for (const selector of PRODUCT_IMAGE_SELECTORS) {
      try {
        const img = document.querySelector(selector);
        if (img?.src && !isPlaceholderOrIcon(img.src)) {
          const url = resolveUrl(img.src);
          if (url) return url;
        }
      } catch {
      }
    }
    return null;
  }
  function isPlaceholderOrIcon(src) {
    const lower = src.toLowerCase();
    return lower.includes("placeholder") || lower.includes("icon-") || lower.includes("logo") || lower.includes("spacer") || lower.includes("1x1") || lower.includes("pixel") || lower.includes("blank") || lower.includes("no-image") || lower.includes("noimage");
  }
  function resolveUrl(url) {
    try {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return toHttps(new URL(url).href);
      }
      if (url.startsWith("//")) {
        return new URL(`https:${url}`).href;
      }
      return toHttps(new URL(url, window.location.href).href);
    } catch {
      return null;
    }
  }
  function toHttps(url) {
    return url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
  }
  const SUPPORTED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif"
  ];
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
  const QUALITY_THRESHOLD_OPTIMAL = 1e6;
  const QUALITY_THRESHOLD_SUFFICIENT = 4e5;
  function isSupportedMimeType(mimeType) {
    return SUPPORTED_MIME_TYPES.includes(mimeType);
  }
  function isHeicFile(name, mimeType) {
    return mimeType.startsWith("image/heic") || mimeType.startsWith("image/heif") || /\.(hei[cf]s?|hif)$/i.test(name);
  }
  function validatePhotoFile(file) {
    if (!isSupportedMimeType(file.type) && !isHeicFile(file.name, file.type)) {
      return { valid: false, error: "unsupported_format" };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { valid: false, error: "file_too_large" };
    }
    return { valid: true };
  }
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }
  function assessPhotoQuality(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const pixels = img.naturalWidth * img.naturalHeight;
        let quality;
        if (pixels >= QUALITY_THRESHOLD_OPTIMAL) {
          quality = "optimal";
        } else if (pixels >= QUALITY_THRESHOLD_SUFFICIENT) {
          quality = "sufficient";
        } else {
          quality = "low";
        }
        resolve({ quality, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => reject(new Error("Failed to load image for quality assessment"));
      img.src = dataUrl;
    });
  }
  const PHOTO_MAX_EDGE_PX = 2048;
  const MEASURE_MAX_EDGE_PX = 1024;
  const PHOTO_JPEG_QUALITY = 0.85;
  const PHOTO_WEBP_QUALITY = 0.85;
  const DATA_URL_SAFE_LENGTH = 4e6;
  function fitWithinMaxEdge(width, height, maxEdge = PHOTO_MAX_EDGE_PX) {
    const longest = Math.max(width, height);
    if (longest <= maxEdge || longest <= 0) return { width, height };
    const scale = maxEdge / longest;
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
  }
  let webpEncodeSupported = null;
  function supportsWebpEncode() {
    if (webpEncodeSupported === null) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        webpEncodeSupported = canvas.toDataURL("image/webp").startsWith("data:image/webp");
      } catch {
        webpEncodeSupported = false;
      }
    }
    return webpEncodeSupported;
  }
  function encodePhotoCanvas(canvas) {
    return supportsWebpEncode() ? canvas.toDataURL("image/webp", PHOTO_WEBP_QUALITY) : canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY);
  }
  function downscalePhotoDataUrl(dataUrl, maxEdge = PHOTO_MAX_EDGE_PX) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = fitWithinMaxEdge(img.naturalWidth, img.naturalHeight, maxEdge);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            console.error(
              `[cabina] canvas non disponibile: foto non normalizzata (${dataUrl.length} char)`
            );
            resolve(dataUrl);
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const encoded = encodePhotoCanvas(canvas);
          if (encoded.length > DATA_URL_SAFE_LENGTH) {
            console.error(
              `[cabina] foto normalizzata ancora pesante: ${encoded.length} char (soglia ${DATA_URL_SAFE_LENGTH})`
            );
          }
          resolve(encoded);
        } catch (e) {
          console.error("[cabina] normalizzazione foto fallita, uso l'originale:", e);
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error("Failed to load image for downscale"));
      img.src = dataUrl;
    });
  }
  const PRIVACY_URL = "https://cabina.io/privacy";
  const TERMS_URL = "https://cabina.io/termini";
  function createPhotoCapture(strings, callbacks) {
    const fragment = document.createDocumentFragment();
    const container = document.createElement("div");
    container.setAttribute("data-cabina-photo", "");
    const title = document.createElement("h2");
    title.textContent = strings.title;
    title.style.cssText = "margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a1a;";
    container.appendChild(title);
    const consentHint = document.createElement("p");
    consentHint.setAttribute("data-cabina-photo-consent-hint", "");
    consentHint.setAttribute("role", "status");
    consentHint.style.cssText = "margin:0 0 12px;font-size:13px;line-height:1.4;color:#b45309;font-weight:500;";
    container.appendChild(consentHint);
    const postureHint = document.createElement("p");
    postureHint.textContent = strings.postureHint;
    postureHint.setAttribute("data-cabina-photo-posture", "");
    postureHint.style.cssText = "margin:0 0 16px;font-size:13px;line-height:1.4;color:#6b7280;";
    container.appendChild(postureHint);
    const preview = document.createElement("div");
    preview.setAttribute("data-cabina-photo-preview", "");
    preview.style.cssText = [
      "width:100%",
      "height:200px",
      "border:2px dashed #d1d5db",
      "border-radius:8px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "margin-bottom:12px",
      "background:#f9fafb",
      "overflow:hidden",
      "position:relative"
    ].join(";");
    container.appendChild(preview);
    const qualityIndicator = document.createElement("div");
    qualityIndicator.setAttribute("data-cabina-photo-quality", "");
    qualityIndicator.style.cssText = [
      "font-size:13px",
      "margin-bottom:12px",
      "min-height:20px",
      "text-align:center"
    ].join(";");
    container.appendChild(qualityIndicator);
    const errorArea = document.createElement("div");
    errorArea.setAttribute("data-cabina-photo-error", "");
    errorArea.setAttribute("role", "alert");
    errorArea.style.cssText = [
      "color:#dc2626",
      "font-size:13px",
      "margin-bottom:8px",
      "min-height:20px",
      "display:none"
    ].join(";");
    container.appendChild(errorArea);
    const consentRow = document.createElement("label");
    consentRow.setAttribute("data-cabina-photo-consent-row", "");
    consentRow.style.cssText = [
      "display:flex",
      "align-items:flex-start",
      "gap:8px",
      "margin-bottom:12px",
      "font-size:12px",
      "line-height:1.45",
      "color:#4b5563",
      "cursor:pointer"
    ].join(";");
    const consentCheckbox = document.createElement("input");
    consentCheckbox.type = "checkbox";
    consentCheckbox.checked = false;
    consentCheckbox.setAttribute("data-cabina-photo-consent-check", "");
    consentCheckbox.style.cssText = "margin-top:2px;cursor:pointer;flex-shrink:0;";
    const consentLabel = document.createElement("span");
    appendConsentText(consentLabel, strings);
    consentRow.appendChild(consentCheckbox);
    consentRow.appendChild(consentLabel);
    container.appendChild(consentRow);
    const buttonRow = document.createElement("div");
    buttonRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp";
    fileInput.style.display = "none";
    fileInput.setAttribute("data-cabina-file-input", "");
    container.appendChild(fileInput);
    const uploadBtn = document.createElement("button");
    uploadBtn.textContent = strings.uploadButton;
    uploadBtn.setAttribute("data-cabina-upload-btn", "");
    uploadBtn.style.cssText = buttonStyle$2();
    uploadBtn.addEventListener("click", () => {
      if (!consentCheckbox.checked) return;
      fileInput.click();
    });
    buttonRow.appendChild(uploadBtn);
    container.appendChild(buttonRow);
    fragment.appendChild(container);
    let currentDataUrl = null;
    function applyConsentState() {
      const given = consentCheckbox.checked;
      uploadBtn.disabled = !given;
      uploadBtn.style.opacity = given ? "1" : "0.5";
      consentHint.textContent = given ? "" : strings.consentRequired;
    }
    applyConsentState();
    consentCheckbox.addEventListener("change", () => {
      applyConsentState();
      callbacks.onConsentChange(consentCheckbox.checked);
    });
    function showError(message) {
      errorArea.textContent = message;
      errorArea.style.display = "block";
    }
    function hideError() {
      errorArea.textContent = "";
      errorArea.style.display = "none";
    }
    function showQuality(quality) {
      const labels = {
        optimal: strings.qualityOptimal,
        sufficient: strings.qualitySufficient,
        low: strings.qualityLow
      };
      const colors = {
        optimal: "#16a34a",
        sufficient: "#ca8a04",
        low: "#dc2626"
      };
      const label = labels[quality.quality] ?? quality.quality;
      qualityIndicator.textContent = `${label} (${quality.width}×${quality.height})`;
      qualityIndicator.style.color = colors[quality.quality] ?? "#6b7280";
    }
    function showPreview(dataUrl) {
      preview.innerHTML = "";
      const img = document.createElement("img");
      img.src = dataUrl;
      img.style.cssText = [
        "max-width:100%",
        "max-height:100%",
        "object-fit:contain",
        "border-radius:4px"
      ].join(";");
      preview.appendChild(img);
    }
    function clearPhoto() {
      currentDataUrl = null;
      qualityIndicator.textContent = "";
    }
    let selectionToken = 0;
    async function handleFile(file) {
      hideError();
      const token = ++selectionToken;
      const validation = validatePhotoFile(file);
      if (!validation.valid) {
        clearPhoto();
        if (validation.error === "unsupported_format") {
          showError(strings.unsupportedFormat);
        } else if (validation.error === "file_too_large") {
          showError(strings.fileTooLarge);
        }
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const downscaled = await downscalePhotoDataUrl(dataUrl);
        const quality = await assessPhotoQuality(downscaled);
        if (token !== selectionToken) return;
        currentDataUrl = downscaled;
        showPreview(downscaled);
        showQuality(quality);
        if (quality.quality !== "low" && consentCheckbox.checked) {
          callbacks.onPhotoReady(downscaled);
        }
      } catch {
        if (token !== selectionToken) return;
        clearPhoto();
        showError(isHeicFile(file.name, file.type) ? strings.heicNotSupported : strings.unsupportedFormat);
      }
    }
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) handleFile(file);
      fileInput.value = "";
    });
    return fragment;
  }
  function appendConsentText(target, strings) {
    const link = (href, label) => {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.cssText = "color:#1a1a1a;text-decoration:underline;";
      a.addEventListener("click", (e) => e.stopPropagation());
      return a;
    };
    const pezzi = strings.consentText.split(/(\{termini\}|\{privacy\})/);
    for (const pezzo of pezzi) {
      if (pezzo === "{termini}") {
        target.appendChild(link(TERMS_URL, strings.consentTermsLabel));
      } else if (pezzo === "{privacy}") {
        target.appendChild(link(PRIVACY_URL, strings.consentPrivacyLabel));
      } else if (pezzo) {
        target.appendChild(document.createTextNode(pezzo));
      }
    }
  }
  function buttonStyle$2() {
    return [
      "padding:8px 16px",
      "border:1px solid #d1d5db",
      "border-radius:4px",
      "background:#fff",
      "cursor:pointer",
      "font-size:14px",
      "font-family:inherit",
      "color:#1a1a1a",
      "transition:background 0.15s"
    ].join(";");
  }
  const REFERENCE_HEIGHT_CM = 170;
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function calibrateCircumferences(base, referenceHeightCm, targetHeightCm) {
    const scale = targetHeightCm != null && targetHeightCm > 0 && referenceHeightCm > 0 ? targetHeightCm / referenceHeightCm : 1;
    const out = {};
    for (const key of ["bustCm", "waistCm", "hipsCm"]) {
      const value = base[key];
      if (value != null) {
        out[key] = clamp(Math.round(value * scale), 50, 200);
      }
    }
    return out;
  }
  const CON_SESSO = {
    bust: [16.20876, 0.1779, 0.11905, 1.62536, -1.66086, 0.03597, -0.01659],
    waistOmbelico: [11.32753, 0.07978, 0.24644, 1.76782, -5.74148, 0.0335, -0.01689],
    hips: [11.66154, 0.26867, 0.15013, 1.43309, -9.37653, 0.03628, -0.0749]
  };
  const SENZA_SESSO = {
    bust: [-27.35888, 0.4423, -0.04132, 2.1148],
    waistOmbelico: [21.36806, 0.02579, 0.26898, 1.63968],
    hips: [86.26947, -0.15402, 0.26835, 0.76956]
  };
  const RAPPORTO_VITA = {
    female: [0.9911, -3101e-6],
    male: [1.04178, -2611e-6]
  };
  const BMI_MIN = 15;
  const BMI_MAX = 50;
  function applica(coef, x) {
    return coef.reduce((somma, c, i) => somma + c * (x[i] ?? 0), 0);
  }
  function misureDaAltezzaPeso(heightCm, weightKg, sesso) {
    if (!(heightCm >= 140 && heightCm <= 210 && weightKg >= 35 && weightKg <= 200)) return null;
    const bmi = weightKg / (heightCm / 100) ** 2;
    if (bmi < BMI_MIN || bmi > BMI_MAX) return null;
    const base = [1, heightCm, weightKg, bmi];
    const [x, coef] = sesso ? [[...base, ...sesso === "male" ? [1, heightCm, weightKg] : [0, 0, 0]], CON_SESSO] : [base, SENZA_SESSO];
    const [a, b] = sesso ? RAPPORTO_VITA[sesso] : [0, 1].map((i) => (RAPPORTO_VITA.female[i] + RAPPORTO_VITA.male[i]) / 2);
    return {
      bustCm: Math.round(applica(coef.bust, x)),
      waistCm: Math.round(applica(coef.waistOmbelico, x) * (a + b * bmi)),
      hipsCm: Math.round(applica(coef.hips, x))
    };
  }
  const FIELD_CONFIG = {
    heightCm: { label: "", placeholder: "170", min: 100, max: 220, step: 0.5, required: false },
    weightKg: { label: "", placeholder: "70", min: 30, max: 250, step: 0.5, required: false },
    bustCm: { label: "", placeholder: "90", min: 50, max: 200, step: 0.5, required: false },
    waistCm: { label: "", placeholder: "70", min: 50, max: 200, step: 0.5, required: false },
    hipsCm: { label: "", placeholder: "95", min: 50, max: 200, step: 0.5, required: false },
    footCm: { label: "", placeholder: "26", min: 15, max: 40, step: 0.5, required: false }
  };
  function createMeasuresForm(strings, callbacks, photoData, prefillMeasures, primaryColor = "#1a1a1a", mostraPiede = false, sesso = null) {
    const container = document.createElement("div");
    container.setAttribute("data-cabina-measures-form", "");
    const title = document.createElement("h2");
    title.textContent = strings.title;
    title.style.cssText = "margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a1a;";
    container.appendChild(title);
    const detectionMsg = document.createElement("div");
    detectionMsg.setAttribute("data-cabina-detection-msg", "");
    detectionMsg.style.cssText = [
      "font-size:13px",
      "color:#6b7280",
      "margin-bottom:16px",
      "min-height:20px"
    ].join(";");
    container.appendChild(detectionMsg);
    const ATTESA_PEGGIORE_MS = 9e3;
    const progressWrap = document.createElement("div");
    progressWrap.setAttribute("data-cabina-detection-progress", "");
    progressWrap.style.cssText = "display:none;align-items:center;gap:8px;margin:-8px 0 16px;";
    const progressTrack = document.createElement("div");
    progressTrack.style.cssText = "flex:1;height:4px;border-radius:2px;background:#e5e7eb;overflow:hidden;";
    const progressFill = document.createElement("div");
    progressFill.style.cssText = `width:0%;height:100%;background:${primaryColor};transition:width 0.2s linear;`;
    progressTrack.appendChild(progressFill);
    const progressLabel = document.createElement("span");
    progressLabel.setAttribute("data-cabina-detection-percent", "");
    progressLabel.style.cssText = "font-size:12px;color:#6b7280;min-width:34px;text-align:right;";
    progressWrap.appendChild(progressTrack);
    progressWrap.appendChild(progressLabel);
    container.appendChild(progressWrap);
    let progressTimer = null;
    let detecting = false;
    let submitting = false;
    function setProgress(percent) {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      progressFill.style.width = `${clamped}%`;
      progressLabel.textContent = `${clamped}%`;
    }
    function startProgress() {
      const inizio = Date.now();
      progressWrap.style.display = "flex";
      setProgress(0);
      progressTimer = setInterval(() => {
        if (!progressWrap.isConnected) return stopProgress();
        setProgress((Date.now() - inizio) / ATTESA_PEGGIORE_MS * 90);
      }, 100);
    }
    function stopProgress() {
      if (progressTimer !== null) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
      progressWrap.style.display = "none";
    }
    const globalError = document.createElement("div");
    globalError.setAttribute("data-cabina-form-error", "");
    globalError.style.cssText = [
      "color:#dc2626",
      "font-size:13px",
      "margin-bottom:8px",
      "min-height:20px",
      "display:none"
    ].join(";");
    container.appendChild(globalError);
    const fields = {};
    const fieldErrors = {};
    const autoDetectedLabels = {};
    let autoBaseMeasures = null;
    let referenceHeightCm = REFERENCE_HEIGHT_CM;
    const manualFields = /* @__PURE__ */ new Set();
    const autoFilledFields = /* @__PURE__ */ new Set();
    let stimeDalPeso = false;
    let sessoFormula = sesso;
    let heightHintEl = null;
    const fieldNames = ["heightCm", "weightKg", "bustCm", "waistCm", "hipsCm"];
    const invisibleLabels = [
      strings.height,
      strings.weight,
      strings.bust,
      strings.waist,
      strings.hips
    ];
    if (mostraPiede) {
      fieldNames.push("footCm");
      invisibleLabels.push(strings.foot ?? "Foot length (cm) - optional");
    }
    const errorMessages = {
      heightCm: strings.invalidHeight,
      weightKg: strings.invalidWeight,
      bustCm: strings.invalidBust,
      waistCm: strings.invalidWaist,
      hipsCm: strings.invalidHips,
      footCm: strings.invalidFoot ?? "Foot length: enter a value between 15 and 40 cm"
    };
    for (let i = 0; i < fieldNames.length; i++) {
      const fieldName = fieldNames[i];
      const config = FIELD_CONFIG[fieldName];
      const labelStr = invisibleLabels[i] ?? fieldName;
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "margin-bottom:12px;";
      const label = document.createElement("label");
      label.textContent = labelStr;
      label.style.cssText = "display:block;font-size:14px;font-weight:500;color:#374151;margin-bottom:4px;";
      wrapper.appendChild(label);
      const autoLabel = document.createElement("span");
      autoLabel.setAttribute("data-cabina-auto-label", "");
      autoLabel.textContent = strings.autoDetected;
      autoLabel.style.cssText = [
        "font-size:11px",
        "color:#6b7280",
        "margin-left:8px",
        "font-style:italic",
        "display:none"
      ].join(";");
      label.appendChild(autoLabel);
      autoDetectedLabels[fieldName] = autoLabel;
      const input = document.createElement("input");
      input.setAttribute("type", "text");
      input.setAttribute("inputmode", "numeric");
      input.setAttribute("pattern", "[0-9]*");
      input.placeholder = config.placeholder;
      input.setAttribute("data-min", String(config.min));
      input.setAttribute("data-max", String(config.max));
      input.setAttribute("data-cabina-field", fieldName);
      input.style.cssText = [
        "width:100%",
        "padding:8px 12px",
        "border:1px solid #d1d5db",
        "border-radius:4px",
        "font-size:14px",
        "font-family:inherit",
        "color:#1a1a1a",
        "box-sizing:border-box",
        "outline:none",
        "transition:border-color 0.15s"
      ].join(";");
      input.addEventListener("focus", () => {
        input.style.borderColor = primaryColor;
      });
      input.addEventListener("blur", () => {
        input.style.borderColor = "#d1d5db";
        validateField(fieldName);
      });
      input.addEventListener("input", () => {
        const errEl = fieldErrors[fieldName];
        if (errEl) {
          errEl.textContent = "";
          errEl.style.display = "none";
        }
        input.style.borderColor = "#d1d5db";
        if (fieldName === "heightCm") {
          autoFilledFields.delete("heightCm");
          recalibrateFromHeight();
          updateAutoLabel("heightCm");
          updateHeightHint();
        } else if (fieldName === "weightKg") {
          recalibrateFromHeight();
        } else if (input.value.trim() === "") {
          manualFields.delete(fieldName);
          recalibrateFromHeight();
          updateAutoLabel(fieldName);
        } else {
          manualFields.add(fieldName);
          measureSource = "manual";
          updateAutoLabel(fieldName);
        }
        updateConfirmButton();
      });
      wrapper.appendChild(input);
      fields[fieldName] = input;
      const error = document.createElement("div");
      error.setAttribute("data-cabina-field-error", fieldName);
      error.style.cssText = [
        "color:#dc2626",
        "font-size:12px",
        "margin-top:2px",
        "min-height:18px",
        "display:none"
      ].join(";");
      wrapper.appendChild(error);
      fieldErrors[fieldName] = error;
      if (fieldName === "heightCm") {
        const hint = document.createElement("div");
        hint.setAttribute("data-cabina-height-hint", "");
        hint.textContent = strings.heightCalibrationHint;
        hint.style.cssText = "font-size:12px;color:#6b7280;margin-top:2px;display:none;";
        wrapper.appendChild(hint);
        heightHintEl = hint;
      }
      container.appendChild(wrapper);
    }
    let fit = "regular";
    const fitWrap = document.createElement("div");
    fitWrap.setAttribute("data-cabina-fit", "");
    fitWrap.style.cssText = "margin:4px 0 12px;";
    const fitLabel = document.createElement("div");
    fitLabel.textContent = strings.fit ?? "Fit";
    fitLabel.style.cssText = "font-size:14px;font-weight:500;color:#374151;margin-bottom:4px;";
    fitWrap.appendChild(fitLabel);
    const fitRow = document.createElement("div");
    fitRow.setAttribute("role", "group");
    fitRow.setAttribute("aria-label", strings.fit ?? "Fit");
    fitRow.style.cssText = "display:flex;gap:6px;";
    const fitButtons = [];
    const fitOptions = [
      ["fitted", strings.fitFitted ?? "Fitted"],
      ["regular", strings.fitRegular ?? "Regular"],
      ["relaxed", strings.fitRelaxed ?? "Relaxed"]
    ];
    const paintFit = () => {
      for (const [value, b] of fitButtons) {
        const on = value === fit;
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.style.background = on ? primaryColor : "#fff";
        b.style.color = on ? "#fff" : "#1a1a1a";
        b.style.borderColor = on ? primaryColor : "#d1d5db";
      }
    };
    for (const [value, text] of fitOptions) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.setAttribute("data-cabina-fit-option", value);
      b.style.cssText = "flex:1;padding:8px 4px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;font-family:inherit;cursor:pointer;";
      b.addEventListener("click", () => {
        fit = value;
        paintFit();
      });
      fitButtons.push([value, b]);
      fitRow.appendChild(b);
    }
    paintFit();
    fitWrap.appendChild(fitRow);
    container.appendChild(fitWrap);
    const buttonRow = document.createElement("div");
    buttonRow.style.cssText = "display:flex;gap:8px;margin-top:8px;";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = strings.cancel;
    cancelBtn.setAttribute("data-cabina-cancel-btn", "");
    cancelBtn.style.cssText = buttonStyle$1("#f3f4f6", "#1a1a1a");
    cancelBtn.addEventListener("click", () => callbacks.onCancel());
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = strings.confirm;
    confirmBtn.setAttribute("data-cabina-confirm-btn", "");
    confirmBtn.disabled = true;
    confirmBtn.style.cssText = buttonStyle$1("#1a1a1a", "#fff") + "opacity:0.5;";
    confirmBtn.addEventListener("click", () => handleConfirm());
    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(confirmBtn);
    container.appendChild(buttonRow);
    let measureSource = "manual";
    if (prefillMeasures) {
      fillFromMeasures(prefillMeasures, null);
    }
    if (photoData) {
      startAutoDetection(photoData);
    } else {
      updateConfirmButton();
    }
    function fillFromMeasures(m, autoSource) {
      const isAutoDetected = autoSource != null;
      if (autoSource) {
        measureSource = autoSource;
        autoBaseMeasures = { bustCm: m.bustCm, waistCm: m.waistCm, hipsCm: m.hipsCm };
        referenceHeightCm = m.heightCm ?? REFERENCE_HEIGHT_CM;
      }
      const entries = [
        ["heightCm", m.heightCm],
        ["weightKg", m.weightKg],
        ["bustCm", m.bustCm],
        ["waistCm", m.waistCm],
        ["hipsCm", m.hipsCm]
      ];
      for (const [name, val] of entries) {
        if (val != null) {
          fields[name].value = String(val);
        } else if (!isAutoDetected) {
          fields[name].value = "";
        }
        if (isAutoDetected) {
          if (val != null) autoFilledFields.add(name);
          else autoFilledFields.delete(name);
        }
      }
      if (isAutoDetected) recalibrateFromHeight();
      for (const name of fieldNames) updateAutoLabel(name);
      updateConfirmButton();
      updateHeightHint();
    }
    function updateAutoLabel(name) {
      const label = autoDetectedLabels[name];
      if (!label) return;
      const isAuto = autoFilledFields.has(name) && !manualFields.has(name) && fields[name].value.trim() !== "";
      label.style.display = isAuto ? "inline" : "none";
    }
    function recalibrateFromHeight() {
      const numero = (field, min, max) => {
        const raw = field.value.trim();
        const n = raw === "" ? NaN : parseFloat(normalizeDecimal(raw));
        return !isNaN(n) && n >= min && n <= max ? n : null;
      };
      const target = numero(fields.heightCm, 100, 220);
      const peso = numero(fields.weightKg, 30, 250);
      const daPeso = target != null && peso != null ? misureDaAltezzaPeso(target, peso, sessoFormula) : null;
      if (daPeso) {
        for (const name of ["bustCm", "waistCm", "hipsCm"]) {
          if (manualFields.has(name)) continue;
          fields[name].value = String(daPeso[name]);
          autoFilledFields.add(name);
          updateAutoLabel(name);
        }
        stimeDalPeso = true;
        return;
      }
      if (stimeDalPeso && !autoBaseMeasures) {
        for (const name of ["bustCm", "waistCm", "hipsCm"]) {
          if (manualFields.has(name)) continue;
          fields[name].value = "";
          autoFilledFields.delete(name);
          updateAutoLabel(name);
        }
      }
      stimeDalPeso = false;
      if (!autoBaseMeasures) return;
      const calibrated = calibrateCircumferences(autoBaseMeasures, referenceHeightCm, target);
      for (const name of ["bustCm", "waistCm", "hipsCm"]) {
        if (manualFields.has(name)) continue;
        const v = calibrated[name];
        if (v != null) fields[name].value = String(v);
      }
    }
    function updateHeightHint() {
      if (!heightHintEl) return;
      const show = autoBaseMeasures != null && fields.heightCm.value.trim() === "";
      heightHintEl.style.display = show ? "block" : "none";
    }
    function getCurrentValues() {
      const getVal = (field) => {
        const v = field.value.trim();
        if (v === "") return void 0;
        const n = parseFloat(normalizeDecimal(v));
        return isNaN(n) ? void 0 : n;
      };
      const out = {};
      const setIf = (name, value) => {
        if (value != null) out[name] = value;
      };
      setIf("heightCm", getVal(fields.heightCm));
      setIf("weightKg", getVal(fields.weightKg));
      setIf("bustCm", getVal(fields.bustCm));
      setIf("waistCm", getVal(fields.waistCm));
      setIf("hipsCm", getVal(fields.hipsCm));
      if (fields.footCm) setIf("footCm", getVal(fields.footCm));
      return out;
    }
    function validateField(fieldName, allFields) {
      const errEl = fieldErrors[fieldName];
      const input = fields[fieldName];
      if (!errEl || !input) return;
      const value = normalizeDecimal(input.value.trim());
      if (value === "") {
        const config2 = FIELD_CONFIG[fieldName];
        if (config2.required) {
          errEl.textContent = errorMessages[fieldName];
          errEl.style.display = "block";
          input.style.borderColor = "#dc2626";
        } else {
          errEl.textContent = "";
          errEl.style.display = "none";
          input.style.borderColor = "#d1d5db";
        }
        return;
      }
      if (!/^\d+(\.\d+)?$/.test(value)) {
        errEl.textContent = errorMessages[fieldName];
        errEl.style.display = "block";
        input.style.borderColor = "#dc2626";
        return;
      }
      const num = parseFloat(value);
      if (isNaN(num)) {
        errEl.textContent = errorMessages[fieldName];
        errEl.style.display = "block";
        input.style.borderColor = "#dc2626";
        return;
      }
      const config = FIELD_CONFIG[fieldName];
      if (num < config.min || num > config.max) {
        errEl.textContent = errorMessages[fieldName];
        errEl.style.display = "block";
        input.style.borderColor = "#dc2626";
        return;
      }
      errEl.textContent = "";
      errEl.style.display = "none";
      input.style.borderColor = "#16a34a";
    }
    function updateConfirmButton() {
      const busy = detecting || submitting;
      confirmBtn.disabled = busy;
      confirmBtn.setAttribute("aria-busy", busy ? "true" : "false");
      confirmBtn.style.opacity = busy ? "0.5" : "1";
      confirmBtn.style.cursor = busy ? "progress" : "pointer";
    }
    async function handleConfirm() {
      const values = getCurrentValues();
      submitting = true;
      updateConfirmButton();
      try {
        await callbacks.onConfirm(values, measureSource, fit);
      } finally {
        submitting = false;
        if (container.isConnected) updateConfirmButton();
      }
    }
    async function startAutoDetection(dataUrl) {
      let aiUnavailable = false;
      detectionMsg.textContent = strings.detecting;
      detectionMsg.style.color = "#6b7280";
      detecting = true;
      updateConfirmButton();
      startProgress();
      try {
        if (callbacks.onRequestAiEstimate) {
          detectionMsg.textContent = strings.detectingAI;
          detectionMsg.style.color = "#6b7280";
          try {
            const aiMeasures = await callbacks.onRequestAiEstimate(dataUrl);
            if (!detectionMsg.isConnected) return;
            if (aiMeasures && Object.keys(aiMeasures).length > 0) {
              if (!sesso && aiMeasures.sex) sessoFormula = aiMeasures.sex;
              fillFromMeasures(aiMeasures, "vision");
              detectionMsg.textContent = strings.aiDetected;
              detectionMsg.style.color = "#16a34a";
              return;
            }
          } catch (e) {
            if (e instanceof Error && e.message === VISION_UNAVAILABLE_ERROR) aiUnavailable = true;
          }
        }
        if (!detectionMsg.isConnected) return;
        detectionMsg.textContent = aiUnavailable ? strings.detectionUnavailable : strings.detectionFailed;
        detectionMsg.style.color = "#ca8a04";
      } finally {
        detecting = false;
        setProgress(100);
        stopProgress();
        updateConfirmButton();
      }
    }
    return container;
  }
  function normalizeDecimal(value) {
    return value.replace(",", ".");
  }
  function buttonStyle$1(bg, color) {
    return [
      `background:${bg}`,
      `color:${color}`,
      "padding:10px 20px",
      "border:1px solid #d1d5db",
      "border-radius:4px",
      "cursor:pointer",
      "font-size:14px",
      "font-family:inherit",
      "flex:1",
      "transition:background 0.15s,opacity 0.15s"
    ].join(";");
  }
  const STORAGE_PREFIX$1 = "cabina_measures_";
  function clearMeasurements(apiKey2) {
    try {
      localStorage.removeItem(`${STORAGE_PREFIX$1}${apiKey2}`);
    } catch (e) {
      console.warn("[widget] Failed to clear measurements from localStorage", e);
    }
  }
  const STORAGE_PREFIX = "cabina_photo_consent_";
  const CURRENT_PHOTO_CONSENT_VERSION = 4;
  function getKey(apiKey2) {
    return `${STORAGE_PREFIX}${apiKey2}`;
  }
  function savePhotoConsent(apiKey2, given) {
    try {
      const key = getKey(apiKey2);
      const state = { given, version: CURRENT_PHOTO_CONSENT_VERSION };
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn("[widget] Failed to save photo consent to localStorage", e);
    }
  }
  function loadPhotoConsent(apiKey2) {
    const key = getKey(apiKey2);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.warn("[widget] Corrupted JSON in localStorage, clearing key", key);
        localStorage.removeItem(key);
        return null;
      }
      const result = PhotoConsentSchema.safeParse(parsed);
      if (!result.success) {
        console.warn("[widget] Corrupted photo consent in localStorage, clearing", result.error);
        localStorage.removeItem(key);
        return null;
      }
      return result.data;
    } catch (e) {
      console.warn("[widget] Failed to load photo consent from localStorage", e);
      return null;
    }
  }
  function clearPhotoConsent(apiKey2) {
    try {
      const key = getKey(apiKey2);
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("[widget] Failed to clear photo consent from localStorage", e);
    }
  }
  function isPhotoConsentValid(stored) {
    return stored != null && stored.given === true && stored.version === CURRENT_PHOTO_CONSENT_VERSION;
  }
  function shouldAttemptGenerative(identityMode, stored) {
    if (identityMode === "preset_model") return true;
    return isPhotoConsentValid(stored);
  }
  const AGE_BANDS = ["18-25", "26-35", "36-45", "46-55"];
  function preset(gender, bodyType, labelKey, ageBand) {
    const id = ageBand ? `${gender}-${ageBand}-${bodyType}` : `${gender}-${bodyType}`;
    return {
      id,
      gender,
      ...ageBand && { ageBand },
      bodyType,
      labelKey,
      assetPath: `/models/model-${id}.webp`,
      thumbPath: `/models/model-${id}-thumb.jpg`
    };
  }
  const PRESET_MODELS = [
    preset("female", "slim", "model_gallery.body_slim"),
    preset("female", "regular", "model_gallery.body_regular"),
    preset("female", "curvy", "model_gallery.body_curvy"),
    preset("female", "plus", "model_gallery.body_plus"),
    preset("male", "slim", "model_gallery.body_slim"),
    preset("male", "regular", "model_gallery.body_regular"),
    preset("male", "curvy", "model_gallery.body_curvy_male"),
    preset("male", "plus", "model_gallery.body_plus")
  ];
  const MORE_MODELS = PRESET_MODELS.flatMap(
    (base) => AGE_BANDS.map((band) => preset(base.gender, base.bodyType, base.labelKey, band))
  ).sort(
    (a, b) => (
      // Ordine di rendering: genere, poi fascia, poi corporatura come nelle 8.
      a.gender.localeCompare(b.gender) || a.ageBand.localeCompare(b.ageBand)
    )
  );
  const ALL_MODELS = [...PRESET_MODELS, ...MORE_MODELS];
  function ageBandLabel(band) {
    return band.replace("-", "–");
  }
  const GENDER_LABEL_KEYS = {
    female: "model_gallery.gender_female",
    male: "model_gallery.gender_male"
  };
  const MODEL_GENDERS = ["female", "male"];
  function modelLabel(model) {
    return getLocaleString(model.labelKey);
  }
  function modelAriaLabel(model) {
    const band = model.ageBand ? ` ${ageBandLabel(model.ageBand)}` : "";
    return `${getLocaleString(GENDER_LABEL_KEYS[model.gender])}${band} ${modelLabel(model)}`;
  }
  function createModelCard(model, onSelect) {
    const card = document.createElement("button");
    card.type = "button";
    card.setAttribute("data-cabina-model-card", model.id);
    card.setAttribute("aria-label", modelAriaLabel(model));
    card.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "gap:4px",
      "padding:6px",
      "border:1px solid #d1d5db",
      "border-radius:8px",
      "background:#fff",
      "cursor:pointer",
      "width:64px"
    ].join(";");
    const thumb = document.createElement("img");
    thumb.setAttribute("data-cabina-model-thumb", model.id);
    thumb.loading = "lazy";
    thumb.alt = "";
    thumb.style.cssText = ["width:44px", "height:88px", "object-fit:contain", "display:block"].join(";");
    thumb.addEventListener("error", () => {
      thumb.style.display = "none";
    });
    card.appendChild(thumb);
    const label = document.createElement("span");
    label.textContent = modelLabel(model);
    label.style.cssText = "font-size:11px;color:#374151;text-align:center;";
    card.appendChild(label);
    card.addEventListener("click", () => onSelect(model));
    return card;
  }
  function appendHeading(container, strings) {
    const title = document.createElement("h3");
    title.textContent = strings.title;
    title.style.cssText = "margin:0 0 4px;font-size:15px;font-weight:600;color:#1a1a1a;";
    container.appendChild(title);
    const subtitle = document.createElement("p");
    subtitle.textContent = strings.subtitle;
    subtitle.style.cssText = "margin:0 0 12px;font-size:12px;color:#6b7280;";
    container.appendChild(subtitle);
  }
  function appendGroup(container, heading, group, models, onSelect) {
    const groupTitle = document.createElement("h4");
    groupTitle.setAttribute("data-cabina-model-group", group);
    groupTitle.textContent = heading;
    groupTitle.style.cssText = "margin:8px 0 6px;font-size:12px;font-weight:600;color:#6b7280;text-align:center;";
    container.appendChild(groupTitle);
    const grid = document.createElement("div");
    grid.setAttribute("data-cabina-model-grid", group);
    grid.style.cssText = [
      "display:flex",
      "flex-wrap:wrap",
      "gap:8px",
      "justify-content:center"
    ].join(";");
    for (const model of models) grid.appendChild(createModelCard(model, onSelect));
    container.appendChild(grid);
  }
  function appendErrorArea(container) {
    const errorArea = document.createElement("p");
    errorArea.setAttribute("data-cabina-model-error", "");
    errorArea.style.cssText = ["color:#dc2626", "font-size:12px", "margin:8px 0 0", "display:none"].join(";");
    container.appendChild(errorArea);
  }
  function createShowMoreButton(onShowMore) {
    const more = document.createElement("button");
    more.type = "button";
    more.setAttribute("data-cabina-model-more", "");
    more.textContent = getLocaleString("model_gallery.more_button");
    more.style.cssText = [
      "display:block",
      "margin:12px auto 4px",
      "padding:8px 14px",
      "border:1px solid #d1d5db",
      "border-radius:999px",
      "background:#fff",
      "color:#1a1a1a",
      "font-size:12px",
      "font-family:inherit",
      "cursor:pointer"
    ].join(";");
    more.addEventListener("click", onShowMore);
    return more;
  }
  function createModelGallery(strings, callbacks) {
    const fragment = document.createDocumentFragment();
    const container = document.createElement("div");
    container.setAttribute("data-cabina-model-gallery", "");
    appendHeading(container, strings);
    MODEL_GENDERS.forEach((gender, i) => {
      const models = PRESET_MODELS.filter((m) => m.gender === gender);
      if (models.length === 0) return;
      if (i > 0 && callbacks.onShowMore) container.appendChild(createShowMoreButton(callbacks.onShowMore));
      appendGroup(container, getLocaleString(GENDER_LABEL_KEYS[gender]), gender, models, callbacks.onModelSelected);
    });
    appendErrorArea(container);
    fragment.appendChild(container);
    return fragment;
  }
  function createMoreModelsScreen(strings, onModelSelected) {
    const fragment = document.createDocumentFragment();
    const container = document.createElement("div");
    container.setAttribute("data-cabina-model-more-screen", "");
    appendHeading(container, strings);
    for (const gender of MODEL_GENDERS) {
      for (const band of AGE_BANDS) {
        const models = MORE_MODELS.filter((m) => m.gender === gender && m.ageBand === band);
        if (models.length === 0) continue;
        appendGroup(
          container,
          `${getLocaleString(GENDER_LABEL_KEYS[gender])} · ${ageBandLabel(band)}`,
          `${gender}-${band}`,
          models,
          onModelSelected
        );
      }
    }
    appendErrorArea(container);
    fragment.appendChild(container);
    return fragment;
  }
  function setModelError(container, message) {
    const el = container.querySelector("[data-cabina-model-error]");
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? "block" : "none";
  }
  function resolveModelThumbs(container, baseUrl) {
    const sanitizedBase = baseUrl.replace(/\/+$/, "");
    const thumbs = container.querySelectorAll("[data-cabina-model-thumb]");
    thumbs.forEach((img) => {
      const id = img.getAttribute("data-cabina-model-thumb");
      const model = ALL_MODELS.find((m) => m.id === id);
      if (model) img.src = `${sanitizedBase}${model.thumbPath}`;
    });
  }
  async function fetchModelAsDataUrl(baseUrl, assetPath) {
    const sanitizedBase = baseUrl.replace(/\/+$/, "");
    const url = `${sanitizedBase}${assetPath}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5e3);
    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new Error(`Model asset HTTP ${res.status}: ${assetPath}`);
    }
    const blob = await res.blob();
    if (blob.size === 0) {
      throw new Error(`Model asset empty: ${assetPath}`);
    }
    if (blob.type && !blob.type.startsWith("image/")) {
      throw new Error(`Model asset not an image (${blob.type}): ${assetPath}`);
    }
    return blobToDataUrl(blob);
  }
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("FileReader produced non-string result"));
      };
      reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });
  }
  const FASHN_CATEGORY_MIN_CONFIDENCE = 0.9;
  function fashnCategoryFor(analysis) {
    if (!analysis || analysis.confidence < FASHN_CATEGORY_MIN_CONFIDENCE) return "auto";
    switch (analysis.category) {
      case "top":
      case "outerwear":
        return "tops";
      case "bottom":
        return "bottoms";
      case "dress":
        return "one-pieces";
      default:
        return "auto";
    }
  }
  function removeExistingFor(analysis) {
    if (analysis && (analysis.category === "footwear" || analysis.category === "accessory")) {
      return void 0;
    }
    return removeExistingForCategory(fashnCategoryFor(analysis));
  }
  function removeExistingForCategory(category) {
    return category !== "tops" && category !== "bottoms";
  }
  function resolvePageGarmentParams(analysis) {
    const category = fashnCategoryFor(analysis);
    if (category === "auto") {
      const perche = !analysis ? "analisi assente o fallita" : analysis.confidence < FASHN_CATEGORY_MIN_CONFIDENCE ? `confidenza ${analysis.confidence} sotto la soglia ${FASHN_CATEGORY_MIN_CONFIDENCE}` : `categoria "${analysis.category}" non mappabile su FASHN`;
      console.error(
        `[cabina] Categoria capo ricaduta su "auto" (${perche}): FASHN classificherà il capo da sé. La rimozione dei vestiti esistenti resta richiesta via removeExisting.`
      );
    }
    return { category, removeExisting: removeExistingFor(analysis) };
  }
  function createGarmentSelect(catalog, strings, callbacks, primaryColor = "#1a1a1a", prefillSelected) {
    const fragment = document.createDocumentFragment();
    const container = document.createElement("div");
    container.setAttribute("data-cabina-garment-select", "");
    const title = document.createElement("h3");
    title.textContent = strings.title;
    title.style.cssText = "margin:0 0 12px;font-size:15px;font-weight:600;color:#1a1a1a;";
    container.appendChild(title);
    const defaultBtn = document.createElement("button");
    defaultBtn.type = "button";
    defaultBtn.setAttribute("data-cabina-default-tryon", "");
    defaultBtn.textContent = strings.defaultAction;
    defaultBtn.style.cssText = [
      "display:block",
      "width:100%",
      "padding:12px",
      "margin:0 0 16px",
      `background:${primaryColor}`,
      "color:#fff",
      "border:none",
      "border-radius:8px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer"
    ].join(";");
    function setDefaultBtnBusy(busy) {
      defaultBtn.disabled = busy;
      defaultBtn.setAttribute("aria-busy", busy ? "true" : "false");
      defaultBtn.style.opacity = busy ? "0.6" : "1";
      defaultBtn.style.cursor = busy ? "progress" : "pointer";
    }
    defaultBtn.addEventListener("click", async () => {
      const url = callbacks.getProductImageUrl();
      if (!url) {
        console.warn(
          "[cabina] Immagine prodotto non trovata: il try-on non può partire. Il tema non espone og:image né un contenitore immagine riconosciuto (vedi extractProductImageUrl in utils/product-image.ts)."
        );
        return;
      }
      setDefaultBtnBusy(true);
      let params = { category: "auto", removeExisting: true };
      try {
        params = await callbacks.getProductGarmentParams?.() ?? params;
      } catch {
      }
      setDefaultBtnBusy(false);
      callbacks.onGarmentsConfirmed([{
        imageUrl: url,
        category: params.category,
        removeExisting: params.removeExisting,
        garmentPhotoType: "auto"
      }]);
    });
    container.appendChild(defaultBtn);
    if (catalog && catalog.collections.length > 0 && catalog.garments.length > 0) {
      let updateCounter = function() {
        counter.textContent = `${selected.length}/${MAX_MIX_AND_MATCH_GARMENTS}`;
        applyBtn.disabled = selected.length === 0;
        applyBtn.style.opacity = selected.length === 0 ? "0.5" : "1";
      }, renderGarments = function(collectionId) {
        grid.innerHTML = "";
        const garments = catalog.garments.filter((g) => g.collectionId === collectionId);
        for (const garment of garments) {
          let refreshCardStyle = function() {
            const isSelected = selected.some((s) => s.id === garment.id);
            card.style.borderColor = isSelected ? primaryColor : "#d1d5db";
            card.style.background = isSelected ? "#eff6ff" : "#fff";
            card.setAttribute("aria-label", `${isSelected ? strings.remove : strings.addToMix}: ${garment.label}`);
          };
          const card = document.createElement("button");
          card.type = "button";
          card.setAttribute("data-cabina-garment-card", garment.id);
          card.style.cssText = [
            "display:flex",
            "flex-direction:column",
            "align-items:center",
            "gap:4px",
            "padding:6px",
            "border:1px solid #d1d5db",
            "border-radius:8px",
            "background:#fff",
            "cursor:pointer"
          ].join(";");
          const img = document.createElement("img");
          img.alt = "";
          img.src = garment.imageUrl;
          img.style.cssText = "width:60px;height:60px;object-fit:contain;display:block;";
          img.addEventListener("error", () => {
            img.style.display = "none";
          });
          card.appendChild(img);
          const label = document.createElement("span");
          label.textContent = garment.label;
          label.style.cssText = "font-size:10px;color:#374151;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:72px;";
          card.appendChild(label);
          refreshCardStyle();
          card.addEventListener("click", () => {
            const idx = selected.findIndex((s) => s.id === garment.id);
            if (idx >= 0) {
              selected.splice(idx, 1);
              limitMsg.style.display = "none";
            } else {
              if (selected.length >= MAX_MIX_AND_MATCH_GARMENTS) {
                limitMsg.style.display = "block";
                return;
              }
              selected.push(garment);
              limitMsg.style.display = "none";
            }
            refreshCardStyle();
            updateCounter();
          });
          grid.appendChild(card);
        }
      };
      const browseLabel = document.createElement("p");
      browseLabel.textContent = strings.browseLabel;
      browseLabel.style.cssText = "margin:0 0 8px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;";
      container.appendChild(browseLabel);
      const selected = [];
      if (prefillSelected && prefillSelected.length > 0) {
        for (const g of catalog.garments) {
          if (selected.length >= MAX_MIX_AND_MATCH_GARMENTS) break;
          if (prefillSelected.some((p) => p.imageUrl === g.imageUrl && p.category === g.fashnCategory)) {
            selected.push(g);
          }
        }
      }
      const tabsContainer = document.createElement("div");
      tabsContainer.setAttribute("data-cabina-catalog-tabs", "");
      tabsContainer.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;";
      const grid = document.createElement("div");
      grid.setAttribute("data-cabina-catalog-grid", "");
      grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-bottom:12px;";
      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.textContent = strings.apply;
      applyBtn.style.cssText = [
        "display:block",
        "width:100%",
        "padding:10px",
        `background:${primaryColor}`,
        "color:#fff",
        "border:none",
        "border-radius:8px",
        "font-size:14px",
        "font-weight:600",
        "cursor:pointer"
      ].join(";");
      applyBtn.addEventListener("click", () => {
        if (selected.length === 0) return;
        const garments = selected.map((g) => ({
          imageUrl: g.imageUrl,
          category: g.fashnCategory,
          // 2026-08-09 — i capi di catalogo sono capi per costruzione (li sceglie
          // il merchant a mano): rimozione sempre richiesta, misurata sicura sul
          // banco (vedi `removeExistingFor`).
          // 2026-08-13 — non più "sempre": stessa regola delle altre due strade.
          // Cablato a `true`, questo flusso avrebbe continuato a produrre le
          // collane inventate del 13/08 — ed è il flusso che manda PIÙ capi
          // insieme, quindi il difetto si sarebbe moltiplicato per la cascata.
          removeExisting: removeExistingForCategory(g.fashnCategory),
          // 2026-08-12 — tipo di foto del capo: catalogo = "auto" (il merchant
          // potrebbe aver caricato packshot o model-worn, FASHN sceglie da sé).
          garmentPhotoType: "auto"
        }));
        callbacks.onGarmentsConfirmed(garments);
      });
      const counter = document.createElement("p");
      counter.setAttribute("data-cabina-mix-counter", "");
      counter.style.cssText = "font-size:12px;color:#6b7280;margin:0 0 4px;";
      const limitMsg = document.createElement("p");
      limitMsg.setAttribute("data-cabina-mix-limit", "");
      limitMsg.textContent = strings.mixLimitReached;
      limitMsg.style.cssText = "font-size:12px;color:#dc2626;margin:0 0 8px;display:none;";
      updateCounter();
      for (const collection of catalog.collections) {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.textContent = collection.label;
        tab.setAttribute("data-cabina-catalog-tab", collection.id);
        tab.style.cssText = [
          "padding:6px 12px",
          "border:1px solid #d1d5db",
          "border-radius:6px",
          "background:#fff",
          "color:#374151",
          "font-size:12px",
          "cursor:pointer"
        ].join(";");
        tab.addEventListener("click", () => {
          tabsContainer.querySelectorAll("[data-cabina-catalog-tab]").forEach((t) => {
            t.style.borderColor = "#d1d5db";
            t.style.background = "#fff";
            t.style.color = "#374151";
          });
          tab.style.borderColor = primaryColor;
          tab.style.background = "#eff6ff";
          tab.style.color = primaryColor;
          renderGarments(collection.id);
        });
        tabsContainer.appendChild(tab);
      }
      container.appendChild(tabsContainer);
      container.appendChild(grid);
      container.appendChild(counter);
      container.appendChild(limitMsg);
      container.appendChild(applyBtn);
      const firstTab = tabsContainer.querySelector("[data-cabina-catalog-tab]");
      if (firstTab) firstTab.click();
    }
    fragment.appendChild(container);
    return fragment;
  }
  function createRotationHandler(callbacks, availableIndices = [0, 1, 2, 3], initialAngle) {
    const cycle = [...new Set(availableIndices)].sort((a, b) => a - b);
    const indices = cycle.length > 0 ? cycle : [0];
    let currentAngle = initialAngle !== void 0 && indices.includes(initialAngle) ? initialAngle : indices[0];
    let container = null;
    let pointerStartX = 0;
    let isDragging = false;
    const DRAG_THRESHOLD = 50;
    const activePointers = /* @__PURE__ */ new Set();
    const pointerLastX = /* @__PURE__ */ new Map();
    let pointerStartTime = 0;
    const VELOCITY_THRESHOLD_PX_MS = 0.5;
    const MIN_VELOCITY_SWIPE_PX = 15;
    function handlePointerDown(e) {
      activePointers.add(e.pointerId);
      pointerLastX.set(e.pointerId, e.clientX);
      if (e.button !== 0) return;
      if (activePointers.size > 1) {
        isDragging = false;
        return;
      }
      isDragging = true;
      pointerStartX = e.clientX;
      pointerStartTime = performance.now();
      e.preventDefault();
    }
    function handlePointerMove(e) {
      pointerLastX.set(e.pointerId, e.clientX);
      if (!isDragging || activePointers.size > 1) return;
      const deltaX = e.clientX - pointerStartX;
      const elapsedMs = Math.max(performance.now() - pointerStartTime, 1);
      const velocity = Math.abs(deltaX) / elapsedMs;
      const isThresholdSwipe = Math.abs(deltaX) >= DRAG_THRESHOLD;
      const isQuickSwipe = velocity >= VELOCITY_THRESHOLD_PX_MS && Math.abs(deltaX) >= MIN_VELOCITY_SWIPE_PX;
      if (isThresholdSwipe || isQuickSwipe) {
        const pos = indices.indexOf(currentAngle);
        const safePos = pos === -1 ? 0 : pos;
        const nextPos = deltaX > 0 ? (safePos + 1) % indices.length : (safePos - 1 + indices.length) % indices.length;
        currentAngle = indices[nextPos];
        pointerStartX = e.clientX;
        pointerStartTime = performance.now();
        callbacks.onAngleChange(currentAngle);
      }
    }
    function handlePointerUp(e) {
      pointerLastX.delete(e.pointerId);
      activePointers.delete(e.pointerId);
      if (activePointers.size === 1) {
        isDragging = true;
        const remainingId = [...activePointers][0];
        pointerStartX = pointerLastX.get(remainingId) ?? e.clientX;
        pointerStartTime = performance.now();
      } else {
        isDragging = false;
      }
    }
    function attach(el) {
      detach();
      container = el;
      el.style.touchAction = "none";
      el.style.userSelect = "none";
      el.addEventListener("pointerdown", handlePointerDown);
      el.addEventListener("pointermove", handlePointerMove);
      el.addEventListener("pointerup", handlePointerUp);
      el.addEventListener("pointercancel", handlePointerUp);
      el.addEventListener("pointerleave", handlePointerUp);
    }
    function detach() {
      if (!container) return;
      container.style.touchAction = "";
      container.style.userSelect = "";
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("pointercancel", handlePointerUp);
      container.removeEventListener("pointerleave", handlePointerUp);
      container = null;
      isDragging = false;
      activePointers.clear();
      pointerLastX.clear();
    }
    return {
      attach,
      detach,
      getAngle: () => currentAngle
    };
  }
  const MIN_SCALE = 1;
  const MAX_SCALE = 3;
  const ZOOM_SENSITIVITY = 1e-3;
  const DOUBLE_TAP_DELAY = 300;
  function createZoomHandler(callbacks) {
    let container = null;
    let currentTransform = { scale: 1, translateX: 0, translateY: 0 };
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let isPinching = false;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartTranslateX = 0;
    let panStartTranslateY = 0;
    let lastTapTime = 0;
    function clampScale(scale) {
      return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    }
    function clampPan(tx, ty, scale) {
      const maxPan = Math.max(0, (scale - 1) * 100);
      return {
        tx: Math.max(-maxPan, Math.min(maxPan, tx)),
        ty: Math.max(-maxPan, Math.min(maxPan, ty))
      };
    }
    function updateTransform(partial) {
      currentTransform = { ...currentTransform, ...partial };
      if (partial.scale !== void 0) {
        currentTransform.scale = clampScale(currentTransform.scale);
      }
      if (currentTransform.scale <= 1.01) {
        currentTransform.translateX = 0;
        currentTransform.translateY = 0;
      } else if (partial.translateX !== void 0 || partial.translateY !== void 0) {
        const clamped = clampPan(
          currentTransform.translateX,
          currentTransform.translateY,
          currentTransform.scale
        );
        currentTransform.translateX = clamped.tx;
        currentTransform.translateY = clamped.ty;
      }
      callbacks.onTransformChange({ ...currentTransform });
    }
    function handleWheel(e) {
      e.preventDefault();
      const delta = -e.deltaY * ZOOM_SENSITIVITY;
      const newScale = currentTransform.scale + delta;
      updateTransform({ scale: newScale });
    }
    function getTouchDistance(touches) {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function handleTouchStart(e) {
      if (e.touches.length === 2) {
        isPinching = true;
        pinchStartDist = getTouchDistance(e.touches);
        pinchStartScale = currentTransform.scale;
        isPanning = false;
      } else if (e.touches.length === 1 && currentTransform.scale > 1.01) {
        isPanning = true;
        panStartX = e.touches[0].clientX;
        panStartY = e.touches[0].clientY;
        panStartTranslateX = currentTransform.translateX;
        panStartTranslateY = currentTransform.translateY;
      }
    }
    function handleTouchMove(e) {
      if (isPinching && e.touches.length === 2) {
        const currentDist = getTouchDistance(e.touches);
        if (pinchStartDist > 0) {
          const newScale = pinchStartScale * (currentDist / pinchStartDist);
          updateTransform({ scale: newScale });
        }
        e.preventDefault();
      } else if (isPanning && e.touches.length === 1 && currentTransform.scale > 1.01) {
        const deltaX = e.touches[0].clientX - panStartX;
        const deltaY = e.touches[0].clientY - panStartY;
        updateTransform({
          translateX: panStartTranslateX + deltaX,
          translateY: panStartTranslateY + deltaY
        });
      }
    }
    function handleTouchEnd() {
      isPinching = false;
      isPanning = false;
      pinchStartDist = 0;
    }
    let pointerPanning = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerStartTx = 0;
    let pointerStartTy = 0;
    function handlePointerDown(e) {
      if (e.button !== 0) return;
      if (currentTransform.scale <= 1.01) return;
      pointerPanning = true;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      pointerStartTx = currentTransform.translateX;
      pointerStartTy = currentTransform.translateY;
      e.preventDefault();
    }
    function handlePointerMove(e) {
      if (!pointerPanning) return;
      const deltaX = e.clientX - pointerStartX;
      const deltaY = e.clientY - pointerStartY;
      updateTransform({
        translateX: pointerStartTx + deltaX * (1 / currentTransform.scale),
        translateY: pointerStartTy + deltaY * (1 / currentTransform.scale)
      });
    }
    function handlePointerUp() {
      pointerPanning = false;
    }
    function handleClick(e) {
      const now = Date.now();
      if (now - lastTapTime < DOUBLE_TAP_DELAY) {
        updateTransform({ scale: 1, translateX: 0, translateY: 0 });
      }
      lastTapTime = now;
    }
    function attach(el) {
      detach();
      container = el;
      el.addEventListener("wheel", handleWheel, { passive: false });
      el.addEventListener("touchstart", handleTouchStart, { passive: false });
      el.addEventListener("touchmove", handleTouchMove, { passive: false });
      el.addEventListener("touchend", handleTouchEnd);
      el.addEventListener("touchcancel", handleTouchEnd);
      el.addEventListener("pointerdown", handlePointerDown);
      el.addEventListener("pointermove", handlePointerMove);
      el.addEventListener("pointerup", handlePointerUp);
      el.addEventListener("pointercancel", handlePointerUp);
      el.addEventListener("click", handleClick);
    }
    function detach() {
      if (!container) return;
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("pointercancel", handlePointerUp);
      container.removeEventListener("click", handleClick);
      container = null;
      isPinching = false;
      isPanning = false;
      pointerPanning = false;
    }
    function getTransform() {
      return { ...currentTransform };
    }
    function reset() {
      updateTransform({ scale: 1, translateX: 0, translateY: 0 });
    }
    return { attach, detach, getTransform, reset };
  }
  const SIZE_OPTION_NAME = /(size|taglia|talla|gr(ö|oe|o)sse|taille|maat)/i;
  function isInsideWidget(el) {
    for (let node = el; node; node = node.parentElement) {
      for (const attr of Array.from(node.attributes)) {
        if (attr.name.startsWith("data-cabina")) return true;
      }
    }
    return false;
  }
  function optionContext(el) {
    const parts = [el.name, el.id, el.getAttribute("aria-label") ?? ""];
    const legend = el.closest("fieldset")?.querySelector("legend")?.textContent;
    if (legend) parts.push(legend);
    if (el.id) {
      for (const label of Array.from(document.querySelectorAll("label[for]"))) {
        if (label.getAttribute("for") === el.id) parts.push(label.textContent ?? "");
      }
    }
    return parts.join(" ");
  }
  function sameSize(a, b) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  function preselectSizeOnPage(size) {
    if (!size.trim()) return false;
    const radios = Array.from(
      document.querySelectorAll('input[type="radio"]')
    ).filter((el) => !isInsideWidget(el) && SIZE_OPTION_NAME.test(optionContext(el)));
    const radio = radios.find((el) => sameSize(el.value, size));
    if (radio) {
      if (!radio.checked) radio.click();
      return true;
    }
    const selects = Array.from(document.querySelectorAll("select")).filter(
      (el) => !isInsideWidget(el) && SIZE_OPTION_NAME.test(optionContext(el))
    );
    for (const select of selects) {
      const option = Array.from(select.options).find(
        (o) => sameSize(o.value, size) || sameSize(o.textContent ?? "", size)
      );
      if (!option) continue;
      if (select.value !== option.value) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    }
    return false;
  }
  const KEYBOARD_STEP_PERCENT = 5;
  const INITIAL_CLIP_PERCENT = 50;
  function computeClipPercent(containerRect, pointerX) {
    const width = containerRect.width;
    if (width <= 0) return INITIAL_CLIP_PERCENT;
    const relativeX = pointerX - containerRect.left;
    const percent = relativeX / width * 100;
    return Math.max(0, Math.min(100, percent));
  }
  function buildClipPath(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    return `inset(0 ${100 - clamped}% 0 0)`;
  }
  function createRevealSlider(originalUrl, generatedUrl, callbacks = {}) {
    const fragment = document.createDocumentFragment();
    const container = document.createElement("div");
    container.setAttribute("data-cabina-reveal-slider", "");
    container.style.cssText = [
      "position:relative",
      "width:100%",
      "height:100%",
      "overflow:hidden",
      "touch-action:none",
      // impedisce scroll/gesture del browser durante il drag
      "user-select:none"
    ].join(";");
    const originalImg = document.createElement("img");
    originalImg.setAttribute("data-cabina-reveal-original", "");
    originalImg.alt = getLocaleString("reveal_result.original_alt");
    originalImg.src = originalUrl;
    originalImg.style.cssText = [
      "position:absolute",
      "inset:0",
      "width:100%",
      "height:100%",
      "object-fit:contain",
      "display:block"
    ].join(";");
    originalImg.addEventListener("error", () => {
      originalImg.style.opacity = "0";
    });
    container.appendChild(originalImg);
    const generatedImg = document.createElement("img");
    generatedImg.setAttribute("data-cabina-reveal-generated", "");
    generatedImg.alt = getLocaleString("reveal_result.generated_alt");
    generatedImg.src = generatedUrl;
    generatedImg.style.cssText = [
      "position:absolute",
      "inset:0",
      "width:100%",
      "height:100%",
      "object-fit:contain",
      "display:block",
      `clip-path:${buildClipPath(INITIAL_CLIP_PERCENT)}`
    ].join(";");
    generatedImg.addEventListener("error", () => {
      generatedImg.style.opacity = "0";
    });
    container.appendChild(generatedImg);
    const handle = document.createElement("div");
    handle.setAttribute("data-cabina-reveal-handle", "");
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", getLocaleString("reveal_result.slider_label"));
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", "100");
    handle.setAttribute("aria-valuenow", String(INITIAL_CLIP_PERCENT));
    handle.setAttribute("tabindex", "0");
    handle.style.cssText = [
      "position:absolute",
      "top:0",
      "bottom:0",
      `left:${INITIAL_CLIP_PERCENT}%`,
      "width:4px",
      "background:#fff",
      "box-shadow:0 0 8px rgba(0,0,0,0.4)",
      "cursor:ew-resize",
      "z-index:2",
      "transform:translateX(-50%)"
    ].join(";");
    const knob = document.createElement("div");
    knob.setAttribute("data-cabina-reveal-knob", "");
    knob.textContent = "‹ ›";
    knob.style.cssText = [
      "position:absolute",
      "top:50%",
      "left:50%",
      "transform:translate(-50%,-50%)",
      // ⚠️ 2026-08-20 (Arou) — da 36px a 48. A 36 il pomello si perdeva sulla
      // foto, e chi non lo nota vede meta risultato e se ne va senza aver capito
      // che c'era un confronto da trascinare. Dentro il riquadro del tema la
      // prova e piu piccola che a tutto schermo, quindi il pomello va nella
      // direzione opposta: piu grande, non proporzionale.
      "width:48px",
      "height:48px",
      "border-radius:50%",
      "background:#fff",
      "box-shadow:0 2px 10px rgba(0,0,0,0.45)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "color:#1a1a1a",
      "font-size:22px",
      "font-weight:700",
      "letter-spacing:2px",
      "line-height:1",
      // ⚠️ Trascinabile, NON `pointer-events:none`.
      //
      // Il `pointerdown` sta sulla maniglia, che e larga 4px; il pomello ne e
      // figlio, quindi con gli eventi disattivati un dito che preme il cerchio a
      // 20px dal centro non colpiva niente — passava sotto, all'immagine. Il
      // bersaglio visivo era 48px, l'area di presa 4: chi mira al cerchio e
      // trascina non ottiene nulla, e conclude che il confronto non funziona.
      // Attivandoli, il pointerdown sul pomello risale alla maniglia per bubbling
      // e il trascinamento parte da tutta l'area del cerchio (rilievo della
      // review, PR #129). Ingrandire il pomello senza questo lo peggiorava: piu
      // grande e il bersaglio, piu spesso si manca la presa.
      "pointer-events:auto",
      "cursor:ew-resize"
    ].join(";");
    handle.appendChild(knob);
    container.appendChild(handle);
    const hint = document.createElement("div");
    hint.setAttribute("data-cabina-reveal-hint", "");
    hint.textContent = `↔  ${getLocaleStringOr("reveal_result.drag_hint", "reveal_result.slider_label")}`;
    hint.style.cssText = [
      "position:absolute",
      "left:50%",
      "top:16px",
      "transform:translateX(-50%)",
      "padding:6px 12px",
      "border-radius:999px",
      "background:rgba(0,0,0,0.6)",
      "color:#fff",
      "font-size:12px",
      "white-space:nowrap",
      "pointer-events:none",
      "z-index:3"
    ].join(";");
    container.appendChild(hint);
    function demoSwipe() {
      const passi = [65, 35, INITIAL_CLIP_PERCENT];
      passi.forEach((percent, i) => {
        setTimeout(() => {
          if (!hint.isConnected || isDragging) return;
          applyClip(percent);
        }, 600 + i * 500);
      });
    }
    let isDragging = false;
    function applyClip(percent) {
      const clamped = Math.max(0, Math.min(100, percent));
      generatedImg.style.clipPath = buildClipPath(clamped);
      handle.style.left = `${clamped}%`;
      handle.setAttribute("aria-valuenow", String(Math.round(clamped)));
      callbacks.onClipChange?.(clamped);
    }
    function onPointerMove(e) {
      if (!isDragging) return;
      const rect = container.getBoundingClientRect();
      const percent = computeClipPercent(rect, e.clientX);
      applyClip(percent);
    }
    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      try {
        handle.releasePointerCapture?.(Number(handle.dataset.pointerId) || 0);
      } catch {
      }
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", endDrag);
      document.removeEventListener("pointercancel", endDrag);
    }
    handle.addEventListener("pointerdown", (e) => {
      if (isDragging) return;
      e.preventDefault();
      isDragging = true;
      handle.dataset.pointerId = String(e.pointerId);
      try {
        handle.setPointerCapture?.(e.pointerId);
      } catch {
      }
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", endDrag);
      document.addEventListener("pointercancel", endDrag);
      const rect = container.getBoundingClientRect();
      const percent = computeClipPercent(rect, e.clientX);
      applyClip(percent);
    });
    container.addEventListener("click", (e) => {
      if (isDragging) return;
      const rect = container.getBoundingClientRect();
      const percent = computeClipPercent(rect, e.clientX);
      applyClip(percent);
    });
    handle.addEventListener("keydown", (e) => {
      const current = Number(handle.getAttribute("aria-valuenow") ?? INITIAL_CLIP_PERCENT);
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        applyClip(current - KEYBOARD_STEP_PERCENT);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        applyClip(current + KEYBOARD_STEP_PERCENT);
      }
    });
    fragment.appendChild(container);
    demoSwipe();
    return {
      fragment,
      updateGenerated: (url) => {
        generatedImg.style.opacity = "1";
        generatedImg.src = url;
      },
      setClipPercent: (percent) => {
        applyClip(percent);
      }
    };
  }
  function createSelectStyle(catalog, strings, callbacks) {
    const fragment = document.createDocumentFragment();
    const container = document.createElement("div");
    container.setAttribute("data-cabina-select-style", "");
    container.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "gap:4px",
      "padding:4px 12px"
    ].join(";");
    const label = document.createElement("span");
    label.textContent = strings.label;
    label.style.cssText = "font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.05em;";
    container.appendChild(label);
    if (!catalog || catalog.garments.length === 0) {
      container.style.display = "none";
      fragment.appendChild(container);
      return fragment;
    }
    const maxGarments = Math.min(catalog.garments.length, 12);
    const garments = catalog.garments.slice(0, maxGarments);
    const row = document.createElement("div");
    row.setAttribute("data-cabina-select-style-row", "");
    row.style.cssText = [
      "display:flex",
      "gap:6px",
      "overflow-x:auto",
      "padding:4px 0",
      "-webkit-overflow-scrolling:touch",
      "scrollbar-width:none"
      // Firefox
    ].join(";");
    for (const garment of garments) {
      const card = document.createElement("button");
      card.type = "button";
      card.setAttribute("data-cabina-style-card", garment.id);
      card.setAttribute("aria-label", garment.label);
      card.style.cssText = [
        "display:flex",
        "flex-direction:column",
        "align-items:center",
        "gap:2px",
        "padding:4px",
        "border:1px solid rgba(255,255,255,0.2)",
        "border-radius:6px",
        "background:rgba(255,255,255,0.1)",
        "cursor:pointer",
        "flex-shrink:0",
        "width:56px"
      ].join(";");
      const img = document.createElement("img");
      img.alt = "";
      img.src = garment.imageUrl;
      img.style.cssText = "width:40px;height:40px;object-fit:contain;display:block;";
      img.addEventListener("error", () => {
        img.style.display = "none";
      });
      card.appendChild(img);
      const nameSpan = document.createElement("span");
      nameSpan.textContent = garment.label;
      nameSpan.style.cssText = "font-size:9px;color:rgba(255,255,255,0.85);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50px;";
      card.appendChild(nameSpan);
      card.addEventListener("click", () => {
        callbacks.onGarmentSelected({
          imageUrl: garment.imageUrl,
          category: garment.fashnCategory,
          // 2026-08-09 — capo da catalogo merchant: rimozione dei vestiti sempre
          // richiesta (misurata sicura sul banco, vedi `removeExistingFor`).
          // 2026-08-13 — non più "sempre": stessa regola del capo di pagina, qui
          // applicata alla categoria del catalogo. Cablato a `true`, il mix&match
          // avrebbe continuato a produrre le collane inventate del 13/08.
          removeExisting: removeExistingForCategory(garment.fashnCategory)
        });
      });
      row.appendChild(card);
    }
    container.appendChild(row);
    fragment.appendChild(container);
    return fragment;
  }
  const FETCH_BLOB_TIMEOUT_MS = 15e3;
  function extensionFromMime(mime) {
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
    if (mime.includes("webp")) return "webp";
    return "png";
  }
  async function fetchImageBlob(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_BLOB_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Download fallito: HTTP ${res.status}`);
      return await res.blob();
    } finally {
      clearTimeout(timeoutId);
    }
  }
  async function downloadImage(url, filenameBase) {
    try {
      const blob = await fetchImageBlob(url);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${filenameBase}.${extensionFromMime(blob.type)}`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
      }, 100);
    } catch {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenameBase}.png`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 100);
    }
  }
  async function shareImageFile(url, filenameBase) {
    if (typeof navigator === "undefined" || !navigator.share) return "unsupported";
    if (!navigator.canShare) return "unsupported";
    try {
      const blob = await fetchImageBlob(url);
      const file = new File([blob], `${filenameBase}.${extensionFromMime(blob.type)}`, { type: blob.type || "image/png" });
      if (!navigator.canShare({ files: [file] })) return "unsupported";
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      return "unsupported";
    }
  }
  function createResultActions(generatedUrl, resultId, strings, callbacks) {
    const fragment = document.createDocumentFragment();
    let currentUrl = generatedUrl;
    let currentResultId = resultId;
    const container = document.createElement("div");
    container.setAttribute("data-cabina-result-actions", "");
    container.style.cssText = [
      "display:flex",
      "gap:8px",
      "justify-content:center",
      "padding:12px",
      "background:rgba(0,0,0,0.6)",
      "backdrop-filter:blur(8px)",
      "-webkit-backdrop-filter:blur(8px)",
      "border-radius:8px"
    ].join(";");
    const filenameBase = `cabina-tryon-${Date.now()}`;
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.setAttribute("data-cabina-action-save", "");
    saveBtn.textContent = strings.save;
    saveBtn.style.cssText = buttonStyle();
    saveBtn.addEventListener("click", async () => {
      if (saveBtn.disabled) return;
      saveBtn.disabled = true;
      saveBtn.style.opacity = "0.6";
      try {
        await downloadImage(currentUrl, filenameBase);
      } finally {
        saveBtn.disabled = false;
        saveBtn.style.opacity = "1";
      }
    });
    container.appendChild(saveBtn);
    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.setAttribute("data-cabina-action-share", "");
    shareBtn.textContent = strings.share;
    shareBtn.style.cssText = buttonStyle();
    shareBtn.addEventListener("click", async () => {
      if (shareBtn.disabled) return;
      shareBtn.disabled = true;
      shareBtn.style.opacity = "0.6";
      try {
        const outcome = await shareImageFile(currentUrl, filenameBase);
        if (outcome === "unsupported") {
          await downloadImage(currentUrl, filenameBase);
        }
      } finally {
        shareBtn.disabled = false;
        shareBtn.style.opacity = "1";
      }
    });
    container.appendChild(shareBtn);
    const reportBtn = document.createElement("button");
    reportBtn.type = "button";
    reportBtn.setAttribute("data-cabina-action-report", "");
    reportBtn.textContent = strings.report;
    reportBtn.style.cssText = buttonStyle();
    reportBtn.addEventListener("click", () => {
      if (reportBtn.disabled) return;
      reportBtn.textContent = strings.reportConfirm;
      reportBtn.disabled = true;
      reportBtn.style.opacity = "0.6";
      const { apiKey: apiKey2, baseUrl } = callbacks.getApiContext();
      sendTryonReport(apiKey2, baseUrl, currentResultId);
    });
    container.appendChild(reportBtn);
    fragment.appendChild(container);
    return {
      fragment,
      updateResult: (url, newResultId) => {
        currentUrl = url;
        currentResultId = newResultId;
      }
    };
  }
  function buttonStyle(opzioni = {}) {
    return [
      "padding:8px 16px",
      opzioni.primario ? "background:#fff" : "background:rgba(255,255,255,0.15)",
      opzioni.primario ? "color:#111" : "color:#fff",
      opzioni.primario ? "border:1px solid #fff" : "border:1px solid rgba(255,255,255,0.3)",
      "border-radius:6px",
      "font-size:13px",
      opzioni.primario ? "font-weight:600" : "font-weight:500",
      "cursor:pointer",
      "transition:background 0.15s ease"
    ].join(";");
  }
  function contestoAcquisto() {
    const nostroPulsante = document.querySelector("[data-cabina-widget-btn]");
    return nostroPulsante?.closest("form") ?? document;
  }
  function primoUtilizzabile(dentro) {
    for (const selettore of ADD_TO_CART_SELECTORS) {
      for (const nodo of Array.from(document.querySelectorAll(selettore))) {
        const elemento = nodo;
        if (dentro && dentro !== document && !dentro.contains(elemento)) continue;
        if (elemento.matches(":disabled")) continue;
        if (elemento.getAttribute("aria-disabled") === "true") continue;
        return elemento;
      }
    }
    return null;
  }
  function haControlloAcquisto(dentro) {
    return ADD_TO_CART_SELECTORS.some(
      (selettore) => Array.from(document.querySelectorAll(selettore)).some((nodo) => dentro.contains(nodo))
    );
  }
  function trovaPulsanteAcquisto() {
    const contesto = contestoAcquisto();
    const utilizzabile = primoUtilizzabile(contesto);
    if (utilizzabile) return utilizzabile;
    if (contesto === document) return null;
    if (haControlloAcquisto(contesto)) return null;
    return primoUtilizzabile(null);
  }
  function createAddToCartButton(etichetta, callbacks) {
    const pulsanteTema = trovaPulsanteAcquisto();
    if (!pulsanteTema) return null;
    const bottone = document.createElement("button");
    bottone.type = "button";
    bottone.setAttribute("data-cabina-action-cart", "");
    bottone.textContent = etichetta;
    bottone.style.cssText = buttonStyle({ primario: true });
    bottone.addEventListener("click", () => {
      if (bottone.disabled) return;
      bottone.disabled = true;
      pulsanteTema.click();
      callbacks.onAdded();
    });
    return bottone;
  }
  const REGOLE = [
    ["footwear", /\b(shoes?|sneakers?|trainers?|boots?|loafers?|flats|heels?|pumps?|sandals?|mules?|espadrilles?|slippers?|moccasins?|brogues?|scarp[ae]|stival[ei]|stivalett[io]|sandal[oi]|mocassin[oi]|d[ée]collet[ée]|ballerin[ae]|chaussures?|baskets?|bottes?|bottines?|sandales?|escarpins?|zapat(o|os|illa|illas)|botas?|sandalias?|schuhe?|stiefel|sandalen?|turnschuhe?)\b/i],
    ["outerwear", /\b(jackets?|coats?|parkas?|blazers?|trench|puffers?|gilets?|anoraks?|bombers?|outerwear|giacc[ah][ei]?|giubbott[oi]|cappott[oi]|piumin[oi]|capispalla|vestes?|manteaux?|manteau|blousons?|chaquetas?|abrigos?|jacken?|m[äa]ntel)\b/i],
    ["bottom", /\b(jeans|trousers|pants|chinos?|shorts|skirts?|leggings|joggers|bottoms|pantalon[ie]?|pantalones|gonn[ae]|bermudas?|jupes?|faldas?|vaqueros|hosen?|r[öo]cke?)\b/i],
    ["top", /\b(shirts?|t-shirts?|tees?|tops?|blouses?|sweaters?|jumpers?|knit|knitwear|cardigans?|hoodies?|sweatshirts?|polos?|henleys?|crewnecks?|roll-neck|turtlenecks?|tanks?|camici[ae]|magli[ae]|maglion[ei]|felp[ae]|chemises?|pulls?|pullovers?|camisas?|camisetas?|sudaderas?|hemd(en)?|blusen?)\b/i],
    ["dress", /\b(dress(es)?|jumpsuits?|abit[oi]|vestit[oi]|robes?|vestidos?|kleid(er)?)\b/i]
  ];
  const DONNA = /\b(women|woman|womens|female|ladies|donna|donne|femme|femmes|mujer|mujeres|damen|frauen)\b/i;
  const UOMO = /\b(men|man|mens|male|uomo|uomini|homme|hommes|hombre|hombres|herren|m[äa]nner)\b/i;
  function classifica(testi) {
    const t = testi.filter(Boolean).join(" · ");
    const categoria = REGOLE.find(([, re]) => re.test(t))?.[0] ?? null;
    const d = DONNA.test(t);
    const u = UOMO.test(t);
    return { categoria, genere: d === u ? null : d ? "women" : "men" };
  }
  function daProdotto(p) {
    const img = p.images?.[0]?.src;
    if (!img) return null;
    const tags = Array.isArray(p.tags) ? p.tags : (p.tags ?? "").split(",");
    return { id: p.handle, label: p.title, imageUrl: img, ...classifica([p.title, p.product_type ?? "", ...tags]) };
  }
  async function leggiProdottiNegozio() {
    if (typeof window === "undefined" || !window.Shopify) return [];
    try {
      const res = await fetch("/products.json?limit=250", { credentials: "same-origin" });
      if (!res.ok) return [];
      const body = await res.json();
      return body.products ?? [];
    } catch {
      return [];
    }
  }
  function handleDellaPagina(pathname) {
    return pathname.match(/\/products\/([^/?#]+)/)?.[1] ?? null;
  }
  const DA_FASHN = {
    tops: "top",
    bottoms: "bottom",
    "one-pieces": "dress",
    auto: null
  };
  function daCatalogo(catalog) {
    return (catalog?.garments ?? []).map((g) => ({
      id: g.id,
      label: g.label,
      imageUrl: g.imageUrl,
      categoria: DA_FASHN[g.fashnCategory] ?? null,
      genere: null
    }));
  }
  const COMPLEMENTARI = {
    top: ["bottom", "footwear", "outerwear"],
    outerwear: ["top", "bottom", "footwear"],
    bottom: ["top", "footwear", "outerwear"],
    dress: ["footwear", "outerwear"],
    footwear: ["top", "bottom", "outerwear", "dress"]
  };
  function daAnalisi(c) {
    return c === "top" || c === "outerwear" || c === "bottom" || c === "dress" || c === "footwear" ? c : null;
  }
  const PER_CATEGORIA = 6;
  function proposteOutfit(opzioni) {
    const { catalog, prodotti, handlePagina } = opzioni;
    const pagina = prodotti.find((p) => p.handle === handlePagina);
    const classePagina = pagina ? daProdotto(pagina) : null;
    const categoriaPagina = daAnalisi(opzioni.categoriaPagina) ?? classePagina?.categoria ?? null;
    const generePagina = classePagina?.genere ?? null;
    const dalMerchant = catalog != null && catalog.garments.length > 0;
    const fonte = dalMerchant ? daCatalogo(catalog) : prodotti.filter((p) => p.handle !== handlePagina).map(daProdotto).filter((c) => c != null);
    const ammesse = categoriaPagina ? COMPLEMENTARI[categoriaPagina] : null;
    const utili = fonte.filter(
      (c) => (
        // Un capo senza categoria passa solo se l'ha scelto il merchant (fonte B).
        (!ammesse || (c.categoria == null ? dalMerchant : ammesse.includes(c.categoria))) && (!generePagina || !c.genere || c.genere === generePagina)
      )
    );
    const ordine = ammesse ?? ["top", "bottom", "footwear", "outerwear", "dress"];
    const scelte = [];
    for (const cat of ordine) scelte.push(...utili.filter((c) => c.categoria === cat).slice(0, PER_CATEGORIA));
    if (dalMerchant) scelte.push(...utili.filter((c) => c.categoria == null).slice(0, PER_CATEGORIA));
    return scelte;
  }
  function comeCapoSelezionato(c) {
    const category = c.categoria === "top" || c.categoria === "outerwear" ? "tops" : c.categoria === "bottom" ? "bottoms" : c.categoria === "dress" ? "one-pieces" : "auto";
    return { imageUrl: c.imageUrl, category, removeExisting: removeExistingForCategory(category), garmentPhotoType: "auto" };
  }
  const MAX_CAPI_AGGIUNTI = MAX_MIX_AND_MATCH_GARMENTS - 1;
  function tocca(selezione, capo) {
    if (selezione.some((s) => s.id === capo.id)) return selezione.filter((s) => s.id !== capo.id);
    const senzaStessaCategoria = capo.categoria ? selezione.filter((s) => s.categoria !== capo.categoria) : [...selezione];
    if (senzaStessaCategoria.length >= MAX_CAPI_AGGIUNTI) return [...selezione];
    return [...senzaStessaCategoria, capo];
  }
  function createOutfitPanel(capi, strings, onProva) {
    const container = document.createElement("div");
    container.setAttribute("data-cabina-outfit", "");
    container.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "gap:4px",
      "padding:8px 12px",
      "align-self:center",
      "box-sizing:border-box",
      "max-width:min(460px, 92vw)",
      "background:rgba(0,0,0,0.45)",
      "border-radius:10px",
      "backdrop-filter:blur(10px)",
      "-webkit-backdrop-filter:blur(10px)"
    ].join(";");
    const label = document.createElement("button");
    label.type = "button";
    label.setAttribute("data-cabina-outfit-toggle", "");
    label.textContent = strings.label;
    label.style.cssText = "align-self:flex-start;padding:0;border:none;background:none;font-family:inherit;cursor:pointer;font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.05em;";
    container.appendChild(label);
    const row = document.createElement("div");
    row.setAttribute("data-cabina-outfit-row", "");
    row.style.cssText = "display:flex;gap:6px;overflow-x:auto;padding:4px 0;-webkit-overflow-scrolling:touch;scrollbar-width:none;";
    container.appendChild(row);
    const azioni = document.createElement("div");
    azioni.style.cssText = "display:flex;align-items:center;gap:8px;";
    const prova = document.createElement("button");
    prova.type = "button";
    prova.setAttribute("data-cabina-outfit-try", "");
    prova.style.cssText = "padding:8px 14px;border:none;border-radius:999px;background:#fff;color:#1a1a1a;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;";
    const esito = document.createElement("span");
    esito.setAttribute("data-cabina-outfit-status", "");
    esito.setAttribute("role", "status");
    esito.style.cssText = "font-size:12px;color:rgba(255,255,255,0.85);";
    azioni.appendChild(prova);
    azioni.appendChild(esito);
    container.appendChild(azioni);
    let selezione = [];
    let inCorso = false;
    const apri = (aperto) => {
      row.style.display = aperto ? "flex" : "none";
      azioni.style.display = aperto ? "flex" : "none";
      label.setAttribute("aria-expanded", aperto ? "true" : "false");
    };
    label.addEventListener("click", () => apri(row.style.display === "none"));
    const carte = [];
    const aggiorna = () => {
      for (const [capo, carta] of carte) {
        const scelto = selezione.some((s) => s.id === capo.id);
        carta.setAttribute("aria-pressed", scelto ? "true" : "false");
        carta.style.borderColor = scelto ? "#fff" : "rgba(255,255,255,0.2)";
        carta.style.background = scelto ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)";
      }
      prova.textContent = inCorso ? strings.loading : `${strings.tryTogether} (${selezione.length}/${MAX_CAPI_AGGIUNTI})`;
      prova.disabled = inCorso || selezione.length === 0;
      prova.style.opacity = prova.disabled ? "0.5" : "1";
    };
    for (const capo of capi) {
      const carta = document.createElement("button");
      carta.type = "button";
      carta.setAttribute("data-cabina-outfit-card", capo.id);
      carta.setAttribute("aria-label", capo.label);
      carta.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px;border:1px solid rgba(255,255,255,0.2);border-radius:6px;background:rgba(255,255,255,0.1);cursor:pointer;flex-shrink:0;width:56px;";
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.src = capo.imageUrl;
      img.style.cssText = "width:40px;height:40px;object-fit:contain;display:block;";
      img.addEventListener("error", () => {
        img.style.display = "none";
      });
      carta.appendChild(img);
      const nome = document.createElement("span");
      nome.textContent = capo.label;
      nome.style.cssText = "font-size:9px;color:rgba(255,255,255,0.85);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50px;";
      carta.appendChild(nome);
      carta.addEventListener("click", () => {
        if (inCorso) return;
        selezione = tocca(selezione, capo);
        esito.textContent = "";
        aggiorna();
      });
      carte.push([capo, carta]);
      row.appendChild(carta);
    }
    prova.addEventListener("click", async () => {
      if (inCorso || selezione.length === 0) return;
      inCorso = true;
      esito.textContent = "";
      aggiorna();
      let ok = false;
      try {
        ok = await onProva(selezione);
      } catch {
        ok = false;
      }
      inCorso = false;
      esito.textContent = ok ? "" : strings.error;
      aggiorna();
      if (ok) apri(false);
    });
    aggiorna();
    apri(true);
    return container;
  }
  let overlayElement = null;
  let rotationHandler = null;
  let zoomHandler = null;
  let imageElements = [];
  let sizeBadgeElement = null;
  let showSizeScore = false;
  function setShowSizeScore(value) {
    showSizeScore = value;
  }
  const STAGE_ATTR = "data-cabina-stage";
  const SIZE_HOST_ATTR = "data-cabina-size";
  const AUTO_ATTR = "data-cabina-auto";
  function riquadroDellaFoto(img) {
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    let el = img.parentElement;
    let ultimo = img.parentElement ?? img;
    for (let i = 0; i < 6 && el && el !== document.body; i++) {
      if (el.offsetWidth > w + 4 || el.offsetHeight > h + 4) break;
      ultimo = el;
      el = el.parentElement;
    }
    return ultimo;
  }
  function creaStageSullaFoto() {
    for (const selettore of PRODUCT_IMAGE_SELECTORS) {
      let img = null;
      try {
        img = document.querySelector(selettore);
      } catch {
        continue;
      }
      if (!img || !img.offsetWidth || !img.offsetHeight) continue;
      const host = riquadroDellaFoto(img);
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      const stage = document.createElement("div");
      stage.setAttribute(STAGE_ATTR, "");
      stage.setAttribute(AUTO_ATTR, "");
      stage.style.cssText = "position:absolute;inset:0;z-index:1;overflow:hidden;background:#fff;";
      host.appendChild(stage);
      return stage;
    }
    return null;
  }
  function creaSizeHostSottoIlPulsante() {
    const bottone = document.querySelector("[data-cabina-widget-btn]");
    if (!bottone || !bottone.parentElement) return null;
    const host = document.createElement("div");
    host.setAttribute(SIZE_HOST_ATTR, "");
    host.setAttribute(AUTO_ATTR, "");
    bottone.insertAdjacentElement("afterend", host);
    return host;
  }
  function findStage() {
    return document.querySelector(`[${STAGE_ATTR}]`) ?? creaStageSullaFoto();
  }
  function isInline(overlay) {
    return overlay.getAttribute("data-cabina-tryon-inline") === "";
  }
  const SCORE_COLOR = "#4ade80";
  function buildScoreSpan(score) {
    const el = document.createElement("span");
    el.style.cssText = `font-size:18px;font-weight:500;color:${SCORE_COLOR};margin-left:8px;`;
    el.textContent = getLocaleString("size.confidence_score", { score: String(score) });
    return el;
  }
  function buildSizeBadge(recommendation, inline = false) {
    {
      preselectSizeOnPage(recommendation.size);
    }
    const badge = document.createElement("div");
    badge.setAttribute("data-cabina-size-badge", "");
    badge.style.cssText = [
      // ⚠️ 2026-08-13 (Arou) — il badge torna visibile: tolto il `display:none`
      // che lo nascondeva dal 10/08, e con lui torna la preselezione sulla
      // pagina prodotto (qui sopra). Le due cose si muovono insieme: i due
      // commenti si citano a vicenda perché nessuno ne muova metà.
      //
      // Sta dentro `buildSizeBadge` e non ai chiamanti perché questa è la fonte
      // unica dei due percorsi — creazione dell'overlay e `updateSizeBadge` — e
      // quello che l'acquirente vede davvero è quasi sempre il secondo: lo
      // stesso inciampo del 2026-08-03 vale per qualunque proprietà del badge.
      // ── Posizione ──
      // Sovrapposto (overlay): in basso a DESTRA sopra il risultato — decisione
      // di Arou, al centro il badge si prendeva tutta la larghezza davanti alla
      // prova, che è la cosa da guardare.
      // Inline (tema con [data-cabina-size]): il tema gli dà un posto suo sotto
      // la prova, quindi qui il badge smette di sovrapporsi e diventa una card
      // in flusso — sovrapporlo coprirebbe l'immagine senza motivo, visto che
      // lo spazio c'è.
      ...inline ? ["position:static", "width:100%", "max-width:100%"] : ["position:absolute", "bottom:20px", "right:20px", "max-width:70%", "z-index:2"],
      // 2026-08-07 (Arou): più trasparente, perché il box copriva i piedi della
      // modella. Il testo regge lo sfondo che si vede sotto grazie a due cose,
      // non a una: la sfocatura più forte (che appiattisce il contrasto
      // dell'immagine sottostante) e l'ombra sul testo più sotto. Abbassare la
      // sola opacità avrebbe reso il badge illeggibile sulle foto chiare.
      // Inline il fondale non è più un'immagine ma la pagina del negozio: il
      // nero pieno regge da sé, la sfocatura non ha nulla da appiattire.
      inline ? "background:rgb(31,31,31)" : "background:rgba(0,0,0,0.45)",
      "color:#fff",
      "padding:14px 22px",
      "border-radius:10px",
      "text-align:center",
      ...inline ? [] : [
        "text-shadow:0 1px 3px rgba(0,0,0,0.8)",
        "backdrop-filter:blur(14px)",
        "-webkit-backdrop-filter:blur(14px)"
      ],
      "box-sizing:border-box",
      "animation:cabina-fade-in 0.3s ease-out"
    ].join(";");
    const label = document.createElement("span");
    label.style.cssText = "display:block;font-size:13px;color:rgba(255,255,255,0.85);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;";
    label.textContent = getLocaleString("size.recommended_label") || "Taglia Consigliata";
    const sizeLine = document.createElement("div");
    sizeLine.style.cssText = "display:flex;align-items:baseline;justify-content:center;gap:0;";
    const sizeText = document.createElement("span");
    sizeText.style.cssText = "font-size:26px;font-weight:700;";
    sizeText.textContent = recommendation.size;
    sizeLine.appendChild(sizeText);
    if (showSizeScore) sizeLine.appendChild(buildScoreSpan(recommendation.score));
    badge.appendChild(label);
    badge.appendChild(sizeLine);
    const sub = document.createElement("span");
    sub.style.cssText = "display:block;font-size:14px;color:rgba(255,255,255,0.85);margin-top:5px;";
    const alt = recommendation.alternative;
    sub.textContent = recommendation.confidence === "between" && alt ? recommendation.alternativeLarger ? getLocaleStringOr("size.between_smaller", "size.between", {
      size1: recommendation.size,
      size2: alt,
      recommended: recommendation.size
    }) : getLocaleString("size.between", {
      size1: alt,
      size2: recommendation.size,
      recommended: recommendation.size
    }) : getLocaleString("size.recommended");
    badge.appendChild(sub);
    if (recommendation.comfortSize) {
      const comfort = document.createElement("span");
      comfort.setAttribute("data-cabina-comfort-size", "");
      comfort.style.cssText = "display:block;font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;";
      comfort.textContent = getLocaleString("size.comfort_hint", { size: recommendation.comfortSize });
      badge.appendChild(comfort);
    }
    return badge;
  }
  function mountSizeBadge(overlay, recommendation, imageContainerRef) {
    const inline = isInline(overlay);
    const themeHost = inline ? document.querySelector(`[${SIZE_HOST_ATTR}]`) ?? creaSizeHostSottoIlPulsante() : null;
    const imageContainer = imageContainerRef ?? overlay.querySelector("[data-cabina-tryon-image-container]");
    const badge = buildSizeBadge(recommendation, themeHost != null);
    (themeHost ?? imageContainer ?? overlay).appendChild(badge);
    sizeBadgeElement = badge;
    return badge;
  }
  function removeSizeBadge() {
    sizeBadgeElement?.remove();
    sizeBadgeElement = null;
  }
  function showTryOnOverlay(renderResults, onClose, onAngleChange, sizeRecommendation, photoData, catalog, resultId, apiContext, onBack, outfit) {
    removeTryOnOverlay();
    const stage = findStage();
    const inline = stage != null;
    if (stage && getComputedStyle(stage).position === "static") {
      stage.style.position = "relative";
    }
    const overlay = document.createElement("div");
    overlay.setAttribute("data-cabina-tryon", "");
    if (inline) overlay.setAttribute("data-cabina-tryon-inline", "");
    overlay.style.cssText = [
      // Inline: riempie il riquadro del tema, che è `position:relative` e porta
      // già le proporzioni giuste (il tema le fissa da `--cabina-stage-ratio`).
      // Niente fondale — è tutto il punto dell'inline: la pagina del negozio non
      // va oscurata, sta lì intorno e deve restare leggibile e cliccabile.
      // Niente z-index da record: dentro il flusso della pagina competerebbe con
      // header sticky e drawer del carrello del tema, e vincerebbe a sproposito.
      ...inline ? ["position:absolute", "inset:0", "z-index:1"] : [
        "position:fixed",
        "inset:0",
        // 2026-08-07 (Arou): da 0.85 a 0.55. Il fondale nascondeva la pagina del
        // negozio quasi del tutto, e ora dietro c'è qualcosa da vedere — la taglia
        // che la cabina ha appena preselezionato nel selettore del merchant.
        // Scelto guardando i quattro valori sopra la pagina vera del dev store:
        // a 0.65 il selettore non si legge ancora, a 0.4 la foto prodotto del
        // negozio compete con la prova. La separazione la fa l'ombra del riquadro,
        // non il buio del fondale — per questo sotto è stata rinforzata.
        "background:rgba(0,0,0,0.55)",
        "z-index:2147483645"
      ],
      "display:flex",
      "align-items:center",
      "justify-content:center",
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      "animation:cabina-fade-in 0.2s ease-out"
    ].join(";");
    const imageContainer = document.createElement("div");
    imageContainer.setAttribute("data-cabina-tryon-image-container", "");
    imageContainer.style.cssText = [
      "position:relative",
      // Inline il limite è il riquadro del tema, non la finestra. E l'ombra
      // sparisce: serviva a staccare la prova dal fondale scuro (07/08), ma
      // qui non c'è fondale — resterebbe un alone sopra la pagina del negozio.
      // Inline riempie il riquadro del tema, e sono le IMMAGINI ad adattarsi
      // dentro con `object-fit:contain`. Prima il riquadro si allargava per stare
      // dietro all'immagine e l'`overflow:hidden` dello stage tagliava quel che
      // avanzava — in pratica i piedi, che per una prova di scarpe sono tutto
      // (Arou, 2026-08-20).
      ...inline ? ["width:100%", "height:100%", "max-width:100%", "max-height:100%", "border-radius:inherit"] : ["max-width:90vw", "max-height:90vh", "border-radius:12px", "box-shadow:0 12px 48px rgba(0,0,0,0.55)"],
      "overflow:hidden",
      "transition:transform 0.08s ease-out"
    ].join(";");
    const imagesWrapper = document.createElement("div");
    imagesWrapper.setAttribute("data-cabina-tryon-images", "");
    imagesWrapper.style.cssText = [
      "position:relative",
      "width:100%",
      // Inline l'altezza arriva dallo stage del tema; full-screen la detta il
      // sizer qui sotto, che è l'unico figlio in flusso.
      ...inline ? ["height:100%"] : []
    ].join(";");
    const availableIndices = renderResults.map((dataUrl, index) => dataUrl ? index : -1).filter((index) => index >= 0);
    const initialIndex = availableIndices.length > 0 ? availableIndices[0] : 0;
    let revealSlider = null;
    let resultActions = null;
    const hasFront = renderResults[0] != null && photoData != null;
    const isFrontAngle = initialIndex === 0;
    let bottomBar = null;
    if (hasFront && apiContext) {
      bottomBar = document.createElement("div");
      bottomBar.setAttribute("data-cabina-tryon-bottom-bar", "");
      bottomBar.style.cssText = [
        "position:absolute",
        "bottom:80px",
        "left:0",
        "right:0",
        "z-index:3",
        "display:flex",
        "flex-direction:column",
        "gap:8px",
        `opacity:${isFrontAngle ? "1" : "0"}`,
        `pointer-events:${isFrontAngle ? "auto" : "none"}`,
        "transition:opacity 0.3s ease-in-out"
      ].join(";");
      const mostraRisultato = (r) => {
        revealSlider?.updateGenerated(r.url);
        resultActions?.updateResult(r.url, r.resultId);
      };
      if (outfit) {
        const posto = document.createElement("div");
        bottomBar.appendChild(posto);
        void leggiProdottiNegozio().then((prodotti) => {
          const capi = proposteOutfit({
            catalog: catalog ?? null,
            prodotti,
            categoriaPagina: outfit.categoriaPagina,
            handlePagina: handleDellaPagina(window.location.pathname)
          });
          if (capi.length === 0 || !posto.isConnected) return;
          posto.replaceWith(createOutfitPanel(
            capi,
            {
              label: getLocaleString("reveal_result.outfit_label"),
              tryTogether: getLocaleString("reveal_result.outfit_try"),
              loading: getLocaleString("reveal_result.outfit_loading"),
              error: getLocaleString("reveal_result.outfit_error")
            },
            async (selezione) => {
              const esito = await tryonGenerative(
                apiContext.apiKey,
                apiContext.baseUrl,
                photoData,
                [outfit.capoPagina, ...selezione.map(comeCapoSelezionato)],
                window.location.href,
                apiContext.identity
              );
              if (!esito.ok) return false;
              mostraRisultato(esito);
              return true;
            }
          ));
        });
      } else if (catalog && catalog.garments.length > 0) {
        const selectStyleUI = createSelectStyle(
          catalog,
          { label: getLocaleString("reveal_result.select_style_label") },
          {
            onGarmentSelected: async (garment) => {
              const swapResult = await tryonGenerative(
                apiContext.apiKey,
                apiContext.baseUrl,
                photoData,
                [garment],
                window.location.href,
                apiContext.identity
              );
              if (!swapResult.ok) return;
              mostraRisultato(swapResult);
            },
            getPhotoData: () => photoData ?? null
          }
        );
        bottomBar.appendChild(selectStyleUI);
      }
      const addToCart = createAddToCartButton(getLocaleString("reveal_result.add_to_cart"), {
        // La stessa uscita del pulsante ✕: dopo l'aggiunta l'acquirente deve
        // vedere il carrello del negozio — spesso un drawer che si apre da solo —
        // non restare davanti alla propria foto.
        onAdded: onClose
      });
      if (addToCart) bottomBar.appendChild(addToCart);
      resultActions = createResultActions(
        renderResults[0],
        resultId ?? null,
        {
          save: getLocaleString("reveal_result.save"),
          share: getLocaleString("reveal_result.share"),
          report: getLocaleString("reveal_result.report"),
          reportConfirm: getLocaleString("reveal_result.report_confirm")
        },
        {
          getApiContext: () => apiContext
        }
      );
      bottomBar.appendChild(resultActions.fragment);
    }
    const sizer = document.createElement("img");
    sizer.setAttribute("data-cabina-tryon-sizer", "");
    sizer.src = renderResults[initialIndex] ?? "";
    sizer.alt = "";
    sizer.setAttribute("aria-hidden", "true");
    sizer.style.cssText = [
      "display:block",
      "object-fit:contain",
      // ⚠️ `90vw`/`90vh` sono le misure della FINESTRA: giuste quando la prova la
      // occupa, prive di senso dentro il riquadro del tema, dove lo spazio è
      // quello dello stage. Con quei limiti il sizer prendeva la sua altezza
      // naturale, il riquadro cresceva e lo stage tagliava il fondo.
      ...inline ? ["width:100%", "height:100%", "max-width:100%", "max-height:100%"] : ["max-width:90vw", "max-height:90vh"],
      "visibility:hidden"
      // occupa spazio ma non si vede: a mostrare sono gli angoli sopra
    ].join(";");
    imagesWrapper.appendChild(sizer);
    imageElements = [];
    const angleLabels = ["front", "right", "back", "left"];
    renderResults.forEach((dataUrl, index) => {
      if (index === 0 && hasFront && isFrontAngle) {
        const slider = createRevealSlider(photoData, dataUrl);
        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-cabina-angle", String(index));
        wrapper.style.cssText = [
          "position:absolute",
          "inset:0",
          "transition:opacity 0.3s ease-in-out",
          "opacity:1"
        ].join(";");
        wrapper.appendChild(slider.fragment);
        imagesWrapper.appendChild(wrapper);
        imageElements.push(wrapper);
        revealSlider = slider;
        return;
      }
      const img = document.createElement("img");
      img.setAttribute("data-cabina-tryon-image", "");
      img.setAttribute("data-cabina-angle", String(index));
      img.src = dataUrl ?? "";
      img.alt = `Try-on preview — ${angleLabels[index]}`;
      img.style.cssText = [
        "display:block",
        "max-width:100%",
        inline ? "max-height:100%" : "max-height:90vh",
        "object-fit:contain",
        "position:absolute",
        "inset:0",
        "transition:opacity 0.3s ease-in-out",
        // Solo l'angolo iniziale (prima vista disponibile) è visibile
        `opacity:${index === initialIndex ? "1" : "0"}`
      ].join(";");
      if (!dataUrl) {
        img.style.opacity = "0";
      }
      imagesWrapper.appendChild(img);
      imageElements.push(img);
    });
    imageContainer.appendChild(imagesWrapper);
    if (availableIndices.length >= 2) {
      rotationHandler = createRotationHandler(
        {
          onAngleChange: (index) => {
            imageElements.forEach((img, i) => {
              img.style.opacity = i === index ? "1" : "0";
            });
            if (bottomBar) {
              const onFront = index === 0;
              bottomBar.style.opacity = onFront ? "1" : "0";
              bottomBar.style.pointerEvents = onFront ? "auto" : "none";
            }
            onAngleChange?.(index);
          }
        },
        availableIndices,
        initialIndex
      );
      rotationHandler.attach(overlay);
    }
    zoomHandler = createZoomHandler({
      onTransformChange: (transform) => {
        imageContainer.style.transform = `scale(${transform.scale}) translate(${transform.translateX}px, ${transform.translateY}px)`;
      }
    });
    zoomHandler.attach(imageContainer);
    const closeButton = document.createElement("button");
    closeButton.setAttribute("data-cabina-tryon-close", "");
    closeButton.textContent = "✕";
    closeButton.setAttribute("aria-label", "Close try-on");
    closeButton.style.cssText = [
      "position:absolute",
      "top:12px",
      "right:12px",
      "width:36px",
      "height:36px",
      "border-radius:50%",
      "border:none",
      "background:rgba(0,0,0,0.45)",
      "color:#fff",
      "font-size:18px",
      "line-height:1",
      "cursor:pointer",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "transition:background 0.15s ease",
      "backdrop-filter:blur(4px)",
      "-webkit-backdrop-filter:blur(4px)",
      "z-index:1"
    ].join(";");
    closeButton.addEventListener("mouseenter", () => {
      closeButton.style.background = "rgba(0,0,0,0.65)";
    });
    closeButton.addEventListener("mouseleave", () => {
      closeButton.style.background = "rgba(0,0,0,0.45)";
    });
    closeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      onClose();
    });
    imageContainer.appendChild(closeButton);
    if (onBack) {
      const backButton = document.createElement("button");
      backButton.setAttribute("data-cabina-tryon-back", "");
      backButton.textContent = "←";
      backButton.setAttribute("aria-label", getLocaleString("common.back"));
      backButton.style.cssText = [
        "position:absolute",
        "top:12px",
        "left:12px",
        "width:36px",
        "height:36px",
        "border-radius:50%",
        "border:none",
        "background:rgba(0,0,0,0.45)",
        "color:#fff",
        "font-size:18px",
        "line-height:1",
        "cursor:pointer",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "transition:background 0.15s ease",
        "backdrop-filter:blur(4px)",
        "-webkit-backdrop-filter:blur(4px)",
        "z-index:1"
      ].join(";");
      backButton.addEventListener("mouseenter", () => {
        backButton.style.background = "rgba(0,0,0,0.65)";
      });
      backButton.addEventListener("mouseleave", () => {
        backButton.style.background = "rgba(0,0,0,0.45)";
      });
      backButton.addEventListener("click", (e) => {
        e.stopPropagation();
        onBack();
      });
      imageContainer.appendChild(backButton);
    }
    if (!inline) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          onClose();
        }
      });
    }
    if (sizeRecommendation) {
      mountSizeBadge(overlay, sizeRecommendation, imageContainer);
    }
    const escHandler = (e) => {
      if (e.key === "Escape") {
        onClose();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);
    overlay.__escHandler = escHandler;
    overlay.appendChild(imageContainer);
    if (bottomBar) overlay.appendChild(bottomBar);
    (stage ?? document.body).appendChild(overlay);
    if (!document.getElementById("cabina-tryon-styles")) {
      const style = document.createElement("style");
      style.id = "cabina-tryon-styles";
      style.textContent = `
      @keyframes cabina-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
      document.head.appendChild(style);
    }
    overlayElement = overlay;
    return overlay;
  }
  function updateSizeBadge(recommendation) {
    if (!overlayElement) return;
    removeSizeBadge();
    if (!recommendation) return;
    mountSizeBadge(overlayElement, recommendation);
  }
  function removeTryOnOverlay() {
    if (overlayElement) {
      const handler = overlayElement.__escHandler;
      if (handler) {
        document.removeEventListener("keydown", handler);
      }
      if (rotationHandler) {
        rotationHandler.detach();
        rotationHandler = null;
      }
      if (zoomHandler) {
        zoomHandler.detach();
        zoomHandler = null;
      }
      removeSizeBadge();
      overlayElement.remove();
      overlayElement = null;
      imageElements = [];
    }
    document.querySelectorAll(`[${AUTO_ATTR}]`).forEach((el) => el.remove());
  }
  const FOOT_HEIGHT_RATIO = 0.15;
  function stimaPiedeDaAltezza(heightCm) {
    return Math.round(heightCm * FOOT_HEIGHT_RATIO * 2) / 2;
  }
  const Q_EXACT_SINGLE = 1;
  const Q_EXACT_MULTIPLE = 0.7;
  const Q_BETWEEN_MAX = 0.5;
  const Q_VISION_PENALTY = 0.15;
  const SCORE_FLOOR = 80;
  const SCORE_SPAN = 18;
  const CATEGORY_WEIGHT_EXTRA = 0.5;
  const LOOSE_WEIGHT = 0.5;
  const FIT_MARGIN_CM = 2;
  function dimensioniChiave(category) {
    switch (category) {
      case "top":
      case "outerwear":
      case "dress":
        return ["bust", "waist"];
      case "bottom":
        return ["waist", "hips"];
      case "footwear":
        return ["foot"];
      default:
        return ["bust", "waist", "hips"];
    }
  }
  function rangeDi(measures, row, d) {
    const [v, min, max] = d === "height" ? [measures.heightCm, row.heightMin, row.heightMax] : d === "bust" ? [measures.bustCm, row.bustMin, row.bustMax] : d === "waist" ? [measures.waistCm, row.waistMin, row.waistMax] : d === "hips" ? [measures.hipsCm, row.hipsMin, row.hipsMax] : [measures.footCm ?? 0, row.footMin ?? 0, row.footMax ?? 0];
    return isRangeUnspecified(min, max) ? null : { v, min, max };
  }
  function measureInRange(value, min, max) {
    if (isRangeUnspecified(min, max)) return true;
    return value >= min && value <= max;
  }
  function measuresMatchRow(measures, row) {
    return measureInRange(measures.heightCm, row.heightMin, row.heightMax) && measureInRange(measures.bustCm, row.bustMin, row.bustMax) && measureInRange(measures.waistCm, row.waistMin, row.waistMax) && measureInRange(measures.hipsCm, row.hipsMin, row.hipsMax) && // Il piede: dichiarato solo dalle tabelle scarpe (05/09/2026); altrove è
    // [0,0] e non conta, come ogni dimensione non dichiarata.
    measureInRange(measures.footCm ?? 0, row.footMin ?? 0, row.footMax ?? 0);
  }
  function usaIlPiede(sizeTable) {
    return sizeTable.some((r) => !isRangeUnspecified(r.footMin ?? 0, r.footMax ?? 0));
  }
  function categoryWeights(garment) {
    const base = { height: 1, bust: 1, waist: 1, hips: 1, foot: 1 };
    if (!garment) return base;
    const effectiveExtra = CATEGORY_WEIGHT_EXTRA * Math.max(0, Math.min(1, garment.confidence));
    const boosted = 1 + effectiveExtra;
    switch (garment.category) {
      case "top":
      case "outerwear":
        return { ...base, bust: boosted, waist: boosted };
      case "bottom":
        return { ...base, waist: boosted, hips: boosted };
      case "footwear":
        return { ...base, foot: boosted };
      default:
        return base;
    }
  }
  function isRangeUnspecified(min, max) {
    return min === 0 && max === 0;
  }
  function upperLimitsSum(row) {
    let total = 0;
    if (!isRangeUnspecified(row.heightMin, row.heightMax)) total += row.heightMax;
    if (!isRangeUnspecified(row.bustMin, row.bustMax)) total += row.bustMax;
    if (!isRangeUnspecified(row.waistMin, row.waistMax)) total += row.waistMax;
    if (!isRangeUnspecified(row.hipsMin, row.hipsMax)) total += row.hipsMax;
    if (!isRangeUnspecified(row.footMin ?? 0, row.footMax ?? 0)) total += row.footMax ?? 0;
    return total;
  }
  function exceedsRowMax(measures, row) {
    return !isRangeUnspecified(row.heightMin, row.heightMax) && measures.heightCm > row.heightMax || !isRangeUnspecified(row.bustMin, row.bustMax) && measures.bustCm > row.bustMax || !isRangeUnspecified(row.waistMin, row.waistMax) && measures.waistCm > row.waistMax || !isRangeUnspecified(row.hipsMin, row.hipsMax) && measures.hipsCm > row.hipsMax || !isRangeUnspecified(row.footMin ?? 0, row.footMax ?? 0) && (measures.footCm ?? 0) > (row.footMax ?? 0);
  }
  function weightedDistanceFromRow(measures, row, w) {
    let dist = 0;
    if (!isRangeUnspecified(row.heightMin, row.heightMax)) {
      dist += w.height * (Math.max(0, row.heightMin - measures.heightCm) + Math.max(0, measures.heightCm - row.heightMax));
    }
    if (!isRangeUnspecified(row.bustMin, row.bustMax)) {
      dist += w.bust * (Math.max(0, row.bustMin - measures.bustCm) + Math.max(0, measures.bustCm - row.bustMax));
    }
    if (!isRangeUnspecified(row.waistMin, row.waistMax)) {
      dist += w.waist * (Math.max(0, row.waistMin - measures.waistCm) + Math.max(0, measures.waistCm - row.waistMax));
    }
    if (!isRangeUnspecified(row.hipsMin, row.hipsMax)) {
      dist += w.hips * (Math.max(0, row.hipsMin - measures.hipsCm) + Math.max(0, measures.hipsCm - row.hipsMax));
    }
    const footMin = row.footMin ?? 0;
    const footMax = row.footMax ?? 0;
    if (!isRangeUnspecified(footMin, footMax)) {
      const foot = measures.footCm ?? 0;
      dist += w.foot * (Math.max(0, footMin - foot) + Math.max(0, foot - footMax));
    }
    return dist;
  }
  function distanceFromRow(measures, row) {
    let dist = 0;
    for (const d of ["height", "bust", "waist", "hips", "foot"]) {
      const r = rangeDi(measures, row, d);
      if (!r) continue;
      dist += Math.max(0, r.v - r.max) + LOOSE_WEIGHT * Math.max(0, r.min - r.v);
    }
    return dist;
  }
  function weightedRangeWidth(row, w) {
    let total = 0;
    if (!isRangeUnspecified(row.heightMin, row.heightMax)) {
      total += w.height * (row.heightMax - row.heightMin);
    }
    if (!isRangeUnspecified(row.bustMin, row.bustMax)) {
      total += w.bust * (row.bustMax - row.bustMin);
    }
    if (!isRangeUnspecified(row.waistMin, row.waistMax)) {
      total += w.waist * (row.waistMax - row.waistMin);
    }
    if (!isRangeUnspecified(row.hipsMin, row.hipsMax)) {
      total += w.hips * (row.hipsMax - row.hipsMin);
    }
    if (!isRangeUnspecified(row.footMin ?? 0, row.footMax ?? 0)) {
      total += w.foot * ((row.footMax ?? 0) - (row.footMin ?? 0));
    }
    return total;
  }
  function scoreFrom(quality, options) {
    const penalty = (options?.measureSource ?? "manual") === "vision" || options?.footEstimated ? Q_VISION_PENALTY : 0;
    const q = Math.max(0, Math.min(1, quality - penalty));
    return Math.round(SCORE_FLOOR + SCORE_SPAN * q);
  }
  function conOrdine(rec, sizeTable) {
    if (!rec.alternative) return rec;
    const [a, b] = [rec.size, rec.alternative].map((s) => sizeTable.find((r) => r.size === s));
    return a && b ? { ...rec, alternativeLarger: upperLimitsSum(b) > upperLimitsSum(a) } : rec;
  }
  function riga(sizeTable, size, passo) {
    const ordinate = [...sizeTable].sort((a, b) => upperLimitsSum(a) - upperLimitsSum(b));
    const i = ordinate.findIndex((r) => r.size === size);
    return i < 0 ? void 0 : ordinate[i + passo];
  }
  function saltoAmmesso(da, a) {
    const [x, y] = [da, a].map((s) => parseFloat(s.replace(",", ".")));
    return Number.isNaN(x) || Number.isNaN(y) || y > x && y - x <= 1;
  }
  function applicaVestibilita(base, measures, sizeTable, options) {
    const fit = options?.fit ?? "regular";
    if (usaIlPiede(sizeTable)) {
      const successiva = riga(sizeTable, base.size, 1);
      const comfortSize = successiva && saltoAmmesso(base.size, successiva.size) ? successiva.size : void 0;
      if (fit === "relaxed" && comfortSize) {
        return { ...base, size: comfortSize, confidence: "between", alternative: base.size };
      }
      return comfortSize ? { ...base, comfortSize } : base;
    }
    if (fit === "regular") return base;
    const chiave = dimensioniChiave(options?.garment?.category);
    const rigaDi = (size) => sizeTable.find((r) => r.size === size);
    if (base.confidence === "between" && base.alternative) {
      const [a, b] = [rigaDi(base.size), rigaDi(base.alternative)];
      if (!a || !b) return base;
      const [minore2, maggiore] = upperLimitsSum(a) <= upperLimitsSum(b) ? [a, b] : [b, a];
      if (fit === "relaxed") {
        return { ...base, size: maggiore.size, alternative: minore2.size };
      }
      const entraNellaMinore = chiave.every((d) => {
        const r = rangeDi(measures, minore2, d);
        return !r || r.v <= r.max + FIT_MARGIN_CM;
      });
      return entraNellaMinore ? { ...base, size: minore2.size, alternative: maggiore.size } : base;
    }
    const attuale = rigaDi(base.size);
    if (!attuale) return base;
    const range = chiave.map((d) => rangeDi(measures, attuale, d)).filter((r) => r != null);
    if (range.length === 0) return base;
    if (fit === "relaxed") {
      const maggiore = riga(sizeTable, base.size, 1);
      const alLimite = range.some((r) => r.v >= r.max - FIT_MARGIN_CM);
      return maggiore && alLimite ? { ...base, size: maggiore.size, confidence: "between", alternative: base.size } : base;
    }
    const minore = riga(sizeTable, base.size, -1);
    const tuttoAlMinimo = range.every((r) => r.v <= r.min + FIT_MARGIN_CM);
    return minore && tuttoAlMinimo ? { ...base, size: minore.size, confidence: "between", alternative: base.size } : base;
  }
  function consiglioBase(measures, sizeTable, options) {
    if (!sizeTable || sizeTable.length === 0) return null;
    if (options?.footEstimated && !usaIlPiede(sizeTable)) {
      options = { ...options, footEstimated: false };
    }
    if (measures.heightCm <= 0 || measures.bustCm <= 0 || measures.waistCm <= 0 || measures.hipsCm <= 0) {
      return null;
    }
    const exactMatches = sizeTable.filter((row) => measuresMatchRow(measures, row));
    if (exactMatches.length === 1) {
      return {
        size: exactMatches[0].size,
        confidence: "exact",
        score: scoreFrom(Q_EXACT_SINGLE, options)
      };
    }
    if (exactMatches.length > 1) {
      return {
        size: exactMatches[0].size,
        confidence: "exact",
        score: scoreFrom(Q_EXACT_MULTIPLE, options)
      };
    }
    const weights = categoryWeights(options?.garment);
    if (sizeTable.length >= 2) {
      const withDistances = sizeTable.map((row) => ({
        row,
        distance: distanceFromRow(measures, row)
      }));
      withDistances.sort((a, b) => a.distance - b.distance);
      const closest = withDistances[0];
      const second = withDistances[1];
      const larger = upperLimitsSum(closest.row) !== upperLimitsSum(second.row) ? upperLimitsSum(closest.row) > upperLimitsSum(second.row) ? closest : second : sizeTable.indexOf(closest.row) > sizeTable.indexOf(second.row) ? closest : second;
      const smaller = larger === closest ? second : closest;
      const chosen = exceedsRowMax(measures, smaller.row) ? larger : closest;
      const other = chosen === closest ? second : closest;
      const chosenWeightedDist = weightedDistanceFromRow(measures, chosen.row, weights);
      const chosenScale = weightedRangeWidth(chosen.row, weights);
      const chosenNormalized = chosenScale > 0 ? Math.min(1, chosenWeightedDist / chosenScale) : 1;
      return {
        size: chosen.row.size,
        confidence: "between",
        alternative: other.row.size,
        score: scoreFrom(Q_BETWEEN_MAX * (1 - chosenNormalized), options)
      };
    }
    if (measuresMatchRow(measures, sizeTable[0])) {
      return {
        size: sizeTable[0].size,
        confidence: "exact",
        score: scoreFrom(Q_EXACT_SINGLE, options)
      };
    }
    const singleRow = sizeTable[0];
    const singleDist = weightedDistanceFromRow(measures, singleRow, weights);
    const singleScale = weightedRangeWidth(singleRow, weights);
    const singleNormalized = singleScale > 0 ? Math.min(1, singleDist / singleScale) : 1;
    return {
      size: singleRow.size,
      confidence: "between",
      score: scoreFrom(Q_BETWEEN_MAX * (1 - singleNormalized), options)
    };
  }
  function pickSizeTables(tables, category) {
    if (tables.length === 0) return [];
    const volute = category === "outerwear" ? ["outerwear", "top"] : category === "dress" ? ["dress", "top"] : category === "top" || category === "bottom" || category === "footwear" ? [category] : [];
    for (const voluta of volute) {
      const trovate = tables.filter((t) => t.category === voluta);
      if (trovate.length > 0) return trovate;
    }
    const generiche = tables.filter((t) => t.category === null);
    return generiche.length > 0 ? generiche : [tables[0]];
  }
  function recommendFromTables(measures, tables, options) {
    const candidate = pickSizeTables(tables, options?.garment?.category ?? null);
    let migliore = null;
    for (const table of candidate) {
      const recommendation = consiglioBase(measures, table.data, options);
      if (!recommendation) continue;
      const vince = !migliore || recommendation.confidence === "exact" && migliore.recommendation.confidence !== "exact" || recommendation.confidence === migliore.recommendation.confidence && recommendation.score > migliore.recommendation.score;
      if (vince) migliore = { recommendation, table };
    }
    if (!migliore) return null;
    return {
      recommendation: conOrdine(
        applicaVestibilita(migliore.recommendation, measures, migliore.table.data, options),
        migliore.table.data
      ),
      table: migliore.table,
      candidates: candidate.length
    };
  }
  function senzaChiave(valore) {
    return valore.startsWith("form.") ? void 0 : valore;
  }
  const DEFAULT_MEASURES = {
    heightCm: 168,
    bustCm: 90,
    waistCm: 75,
    hipsCm: 96,
    weightKg: 65
  };
  let initStarted = false;
  let modelSelectionInFlight = false;
  const CATEGORIE_CON_AVVISO = ["accessory"];
  let currentLang = null;
  let currentApiKey = null;
  let currentSessionId = null;
  let sessionCompleteSent = false;
  let sessionStarted = false;
  let widgetContext = createInitialContext();
  function identitaTryon(apiKey2) {
    return {
      photoSource: widgetContext.identityMode === "preset_model" ? "preset" : "upload",
      consentVersion: loadPhotoConsent(apiKey2)?.version
    };
  }
  let widgetModal = null;
  let modalEscHandler = null;
  let garmentAnalysis = null;
  let garmentAnalysisDone = Promise.resolve();
  let garmentSelectEntryId = 0;
  let lastTryonResultId = null;
  let lastCatalog = null;
  let currentLogoUrl = null;
  let currentPrimaryColor = "#1a1a1a";
  let outfitAttivo = false;
  function sanitizeColor(value, fallback = "#1a1a1a") {
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }
  function sanitizeLogoUrl(value) {
    if (!value) return null;
    try {
      return new URL(value).protocol === "https:" ? value : null;
    } catch {
      return null;
    }
  }
  function showUnsupportedTooltip(button) {
    const existing = document.querySelector("[data-cabina-tooltip]");
    if (existing) existing.remove();
    const tooltip = document.createElement("div");
    tooltip.setAttribute("data-cabina-tooltip", "");
    tooltip.style.cssText = [
      "position:absolute",
      "bottom:calc(100% + 8px)",
      "left:50%",
      "transform:translateX(-50%)",
      "background:#1a1a1a",
      "color:#fff",
      "padding:10px 14px",
      "border-radius:6px",
      "font-size:13px",
      "max-width:280px",
      "text-align:center",
      "z-index:2147483647",
      "box-shadow:0 2px 12px rgba(0,0,0,0.2)",
      "white-space:normal",
      "pointer-events:auto"
    ].join(";");
    const message = document.createElement("p");
    message.textContent = getLocaleString("browser.unsupported_message");
    message.style.cssText = "margin:0 0 8px;line-height:1.4;";
    const link = document.createElement("a");
    link.textContent = getLocaleString("browser.update_link_text");
    link.href = getBrowserUpdateLink();
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.cssText = [
      "color:#6eb5ff",
      "text-decoration:underline",
      "cursor:pointer",
      "font-size:12px"
    ].join(";");
    tooltip.appendChild(message);
    tooltip.appendChild(link);
    const parent = button.parentElement;
    if (parent) {
      const wrapper = document.createElement("span");
      wrapper.style.cssText = "position:relative;display:inline-block;";
      button.parentNode?.insertBefore(wrapper, button);
      wrapper.appendChild(button);
      wrapper.appendChild(tooltip);
    }
    setTimeout(() => {
      const el = document.querySelector("[data-cabina-tooltip]");
      if (el) el.remove();
    }, 8e3);
  }
  function isMobileViewport() {
    return typeof window !== "undefined" && window.innerWidth < 640;
  }
  function ensureWidgetModal(onClose) {
    if (widgetModal) return widgetModal;
    const mobile = isMobileViewport();
    const overlay = document.createElement("div");
    overlay.setAttribute("data-cabina-modal", "");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      // 2026-08-07 (Arou): alleggerito anche il fondale della cabina, non solo
      // quello del risultato — la pagina del negozio deve restare riconoscibile
      // sotto. Qui si può scendere più dell'overlay risultato perché il contenuto
      // è una scheda opaca, che si stacca da sé.
      mobile ? "background:rgba(0,0,0,0.3)" : "background:rgba(0,0,0,0.4)",
      "display:flex",
      mobile ? "align-items:flex-end" : "align-items:center",
      "justify-content:center",
      "z-index:2147483646",
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'
    ].join(";");
    modalEscHandler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", modalEscHandler);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) onClose?.();
    });
    const container = document.createElement("div");
    container.setAttribute("data-cabina-modal-content", "");
    if (mobile) {
      container.style.cssText = [
        "background:#fff",
        "border-radius:16px 16px 0 0",
        "padding:0 24px 32px",
        "width:100%",
        "max-height:90vh",
        "overflow-y:auto",
        "-webkit-overflow-scrolling:touch",
        "position:relative",
        "animation:cabina-slide-up 0.25s ease-out"
      ].join(";");
      const handle = document.createElement("div");
      handle.setAttribute("data-cabina-sheet-handle", "");
      handle.style.cssText = [
        "width:40px",
        "height:4px",
        "background:#e0e0e0",
        "border-radius:2px",
        "margin:12px auto 16px"
      ].join(";");
      container.appendChild(handle);
      let touchStartY = 0;
      container.addEventListener("touchstart", (e) => {
        touchStartY = e.touches[0].clientY;
      }, { passive: true });
      container.addEventListener("touchend", (e) => {
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        if (deltaY > 80 && container.scrollTop === 0) {
          onClose?.();
        }
      }, { passive: true });
      if (!document.getElementById("cabina-sheet-styles")) {
        const style = document.createElement("style");
        style.id = "cabina-sheet-styles";
        style.textContent = `
        @keyframes cabina-slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `;
        document.head.appendChild(style);
      }
    } else {
      container.style.cssText = [
        "background:#fff",
        "border-radius:8px",
        "padding:24px",
        "max-width:400px",
        "width:90%",
        "box-shadow:0 4px 24px rgba(0,0,0,0.15)",
        "position:relative"
      ].join(";");
    }
    const logo = sanitizeLogoUrl(currentLogoUrl);
    if (logo) {
      const logoImg = document.createElement("img");
      logoImg.setAttribute("data-cabina-logo", "");
      logoImg.src = logo;
      logoImg.alt = "";
      logoImg.style.cssText = [
        "display:block",
        "max-height:36px",
        "max-width:160px",
        "width:auto",
        "object-fit:contain",
        mobile ? "margin:0 auto 16px" : "margin:0 0 16px"
      ].join(";");
      container.appendChild(logoImg);
    }
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    widgetModal = overlay;
    return overlay;
  }
  function removeWidgetModal() {
    if (modalEscHandler) {
      document.removeEventListener("keydown", modalEscHandler);
      modalEscHandler = null;
    }
    if (widgetModal) {
      widgetModal.remove();
      widgetModal = null;
    }
  }
  function restoreDragHandle(content) {
    if (!isMobileViewport()) return;
    const handle = document.createElement("div");
    handle.setAttribute("data-cabina-sheet-handle", "");
    handle.style.cssText = "width:40px;height:4px;background:#e0e0e0;border-radius:2px;margin:12px auto 16px";
    content.insertBefore(handle, content.firstChild);
  }
  function renderRenderErrorBanner(content, error) {
    if (!error) return;
    const banner = document.createElement("p");
    banner.setAttribute("data-cabina-error", "");
    const chiavi = {
      quota: "rendering.quota_exceeded",
      consent: "rendering.consent_required",
      technical: "rendering.unavailable"
    };
    const chiave = chiavi[error] ?? "rendering.unavailable";
    const isQuota = error === "quota";
    banner.style.cssText = isQuota ? "color:#92400e;font-size:13px;margin:0 0 12px;padding:8px 12px;background:#fffbeb;border-radius:4px;" : "color:#dc2626;font-size:13px;margin:0 0 12px;padding:8px 12px;background:#fef2f2;border-radius:4px;";
    banner.setAttribute("role", "alert");
    banner.textContent = getLocaleString(chiave);
    content.appendChild(banner);
  }
  function renderBackButton(content, onBack) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-cabina-back-button", "");
    button.textContent = `← ${getLocaleString("common.back")}`;
    button.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "background:none",
      "border:none",
      "color:#6b7280",
      "font-size:13px",
      "cursor:pointer",
      "padding:4px 0",
      "margin:0 0 12px",
      "font-family:inherit"
    ].join(";");
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      onBack();
    });
    button.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
    button.addEventListener("touchend", (e) => e.stopPropagation(), { passive: true });
    const handle = content.querySelector("[data-cabina-sheet-handle]");
    if (handle) {
      handle.insertAdjacentElement("afterend", button);
    } else {
      content.insertBefore(button, content.firstChild);
    }
  }
  function renderState(button) {
    switch (widgetContext.state) {
      case "idle":
        removeWidgetModal();
        break;
      case "photo": {
        const apiKey2 = currentApiKey;
        if (!apiKey2) return;
        const overlay = ensureWidgetModal(() => {
          widgetContext = widgetReducer(widgetContext, { type: "CLOSE" });
          renderState(button);
        });
        const content = overlay.querySelector("[data-cabina-modal-content]");
        if (!content) return;
        content.innerHTML = "";
        restoreDragHandle(content);
        const photoUI = createPhotoCapture(
          {
            title: getLocaleString("photo.title"),
            postureHint: getLocaleString("photo.posture_hint"),
            uploadButton: getLocaleString("photo.upload_button"),
            fileTooLarge: getLocaleString("photo.file_too_large"),
            unsupportedFormat: getLocaleString("photo.unsupported_format"),
            heicNotSupported: getLocaleStringOr("photo.heic_not_supported", "photo.unsupported_format"),
            qualityOptimal: getLocaleString("photo.quality_optimal"),
            qualitySufficient: getLocaleString("photo.quality_sufficient"),
            qualityLow: getLocaleString("photo.quality_low"),
            consentText: getLocaleString("photo.consent_text"),
            consentPrivacyLabel: getLocaleString("photo.consent_privacy_label"),
            consentTermsLabel: getLocaleString("photo.consent_terms_label"),
            consentRequired: getLocaleString("photo.consent_required")
          },
          {
            onPhotoReady: (dataUrl) => {
              widgetContext = widgetReducer(widgetContext, { type: "PHOTO_UPLOADED", dataUrl });
              renderState(button);
            },
            // La spunta È il consenso: si registra come lo registrava il gate che
            // questa sostituisce — `localStorage` per leggerlo dentro la stessa visita
            // (`identitaTryon`, `shouldAttemptGenerative`), `consent_events` per averne
            // traccia lato nostro. ⚠️ 22/08: NON serve più a ripresentare la casella
            // già spuntata — nasce vuota ogni volta, la spunta la dà l'acquirente.
            // ⚠️ `sendConsentEvent` resta fire-and-forget (AD-4): non deve
            // congelare l'interfaccia. Quindi il consenso è dato anche se la sua
            // PROVA non arriva — è scritto nel piano, non è una svista.
            onConsentChange: (given) => {
              if (given) {
                savePhotoConsent(apiKey2, true);
                sendConsentEvent(apiKey2, widgetContext.baseUrl ?? "", {
                  consentVersion: CURRENT_PHOTO_CONSENT_VERSION,
                  eventType: "given"
                });
              } else {
                clearPhotoConsent(apiKey2);
                sendConsentEvent(apiKey2, widgetContext.baseUrl ?? "", {
                  consentVersion: CURRENT_PHOTO_CONSENT_VERSION,
                  eventType: "revoked"
                });
              }
            },
            onClose: () => {
              widgetContext = widgetReducer(widgetContext, { type: "CLOSE" });
              renderState(button);
            }
          }
        );
        content.appendChild(photoUI);
        {
          const orLabel = document.createElement("p");
          orLabel.textContent = getLocaleString("model_gallery.or_label");
          orLabel.style.cssText = "text-align:center;color:#9ca3af;font-size:12px;margin:16px 0 8px;text-transform:uppercase;letter-spacing:0.05em;";
          content.appendChild(orLabel);
          const onModelSelected = async (model) => {
            if (modelSelectionInFlight) return;
            modelSelectionInFlight = true;
            const baseUrl = widgetContext.baseUrl ?? "";
            const modalContent = overlay.querySelector("[data-cabina-modal-content]");
            if (modalContent) setModelError(modalContent, "");
            try {
              const dataUrl = await downscalePhotoDataUrl(
                await fetchModelAsDataUrl(baseUrl, model.assetPath)
              );
              if (widgetContext.state !== "photo") return;
              widgetContext = widgetReducer(widgetContext, { type: "PRESET_MODEL_SELECTED", dataUrl });
              renderState(button);
            } catch (e) {
              console.warn("[widget] Failed to load preset model", model.assetPath, e);
              const errTarget = overlay.querySelector("[data-cabina-modal-content]");
              if (errTarget) setModelError(errTarget, getLocaleString("model_gallery.load_error"));
            } finally {
              modelSelectionInFlight = false;
            }
          };
          const gallery = createModelGallery(
            {
              title: getLocaleString("model_gallery.title"),
              subtitle: getLocaleString("model_gallery.subtitle")
            },
            {
              onModelSelected,
              // Seconda schermata DENTRO la cabina (2026-09-18): lo stato resta
              // `photo`, cambia solo il contenuto del modale. «← Indietro» ridisegna
              // lo step `photo` com'era — nessun evento nuovo nel reducer.
              onShowMore: () => {
                content.innerHTML = "";
                restoreDragHandle(content);
                renderBackButton(content, () => renderState(button));
                content.appendChild(createMoreModelsScreen(
                  {
                    title: getLocaleString("model_gallery.more_title"),
                    subtitle: getLocaleString("model_gallery.more_subtitle")
                  },
                  onModelSelected
                ));
                resolveModelThumbs(content, widgetContext.baseUrl ?? "");
                content.scrollTop = 0;
              }
            }
          );
          content.appendChild(gallery);
          resolveModelThumbs(content, widgetContext.baseUrl ?? "");
        }
        break;
      }
      case "form": {
        const apiKey2 = currentApiKey;
        if (!apiKey2) return;
        const overlay = ensureWidgetModal(() => {
          widgetContext = widgetReducer(widgetContext, { type: "CLOSE" });
          renderState(button);
        });
        const content = overlay.querySelector("[data-cabina-modal-content]");
        if (!content) return;
        content.innerHTML = "";
        restoreDragHandle(content);
        renderBackButton(content, () => {
          widgetContext = widgetReducer(widgetContext, { type: "BACK" });
          renderState(button);
        });
        renderRenderErrorBanner(content, widgetContext.error);
        const prefillMeasures = widgetContext.measures;
        const form = createMeasuresForm(
          {
            title: getLocaleString("form.title"),
            height: getLocaleString("form.height"),
            weight: getLocaleString("form.weight"),
            bust: getLocaleString("form.bust"),
            waist: getLocaleString("form.waist"),
            hips: getLocaleString("form.hips"),
            // Quel click ora avvia la prova (30 crediti), non solo un cambio
            // schermata: l'etichetta lo dice. Fallback sulla chiave vecchia
            // finché il locale nuovo non è propagato (bundle e JSON hanno cache
            // indipendenti — lezione della 12.6).
            confirm: getLocaleStringOr("form.confirm_and_try", "form.confirm"),
            cancel: getLocaleString("form.cancel"),
            autoDetected: getLocaleString("form.auto_detected"),
            detectionFailed: getLocaleString("form.detection_failed"),
            // Fallback sulla chiave vecchia finché il locale nuovo non è propagato
            // (bundle e JSON hanno cache indipendenti — lezione della 12.6).
            detectionUnavailable: getLocaleStringOr("form.detection_unavailable", "form.detection_failed"),
            detecting: getLocaleString("form.detecting"),
            detectingAI: getLocaleString("form.detecting_ai"),
            aiDetected: getLocaleString("form.ai_detected"),
            invalidHeight: getLocaleString("form.invalid_height"),
            invalidWeight: getLocaleString("form.invalid_weight"),
            invalidBust: getLocaleString("form.invalid_bust"),
            invalidWaist: getLocaleString("form.invalid_waist"),
            invalidHips: getLocaleString("form.invalid_hips"),
            heightCalibrationHint: getLocaleString("form.height_calibration_hint"),
            // Il piede (scarpe, 05/09/2026). Senza fallback su un'altra chiave:
            // «Altezza» al posto di «Piede» sarebbe peggio del testo inglese
            // che il form usa quando il locale non ha ancora la chiave.
            foot: senzaChiave(getLocaleString("form.foot")),
            invalidFoot: senzaChiave(getLocaleString("form.invalid_foot")),
            // Vestibilità (18/09/2026): stessi fallback del piede.
            fit: senzaChiave(getLocaleString("form.fit")),
            fitFitted: senzaChiave(getLocaleString("form.fit_fitted")),
            fitRegular: senzaChiave(getLocaleString("form.fit_regular")),
            fitRelaxed: senzaChiave(getLocaleString("form.fit_relaxed"))
          },
          {
            onConfirm: async (measures, measureSource, fit) => {
              const url = extractProductImageUrl();
              let garments;
              if (url) {
                let params = { category: "auto", removeExisting: true };
                try {
                  params = await garmentAnalysisDone.then(() => resolvePageGarmentParams(garmentAnalysis));
                } catch {
                }
                garments = [{ imageUrl: url, category: params.category, removeExisting: params.removeExisting, garmentPhotoType: "auto" }];
              }
              if (widgetContext.state !== "form") return;
              widgetContext = widgetReducer(widgetContext, { type: "MEASURES_CONFIRMED", measures, measureSource, fit, garments });
              renderState(button);
            },
            onCancel: () => {
              widgetContext = widgetReducer(widgetContext, { type: "CLOSE" });
              renderState(button);
            },
            // ⚠️ Alla stima misure la foto va a 1024px, non ai 2048 del try-on.
            // A 1600 la vision impiega ~5,3s contro i ~7s di budget del primo
            // provider: ogni tanto sforava e rispondeva un SECONDO modello, con
            // misure sue — ed è da lì che veniva «la stima balla fra una prova e
            // l'altra». A 1024 la latenza si dimezza e le stime sono identiche.
            // Vedi `MEASURE_MAX_EDGE_PX`.
            onRequestAiEstimate: async (photoDataUrl) => estimateMeasuresFromPhoto(
              apiKey2,
              await downscalePhotoDataUrl(photoDataUrl, MEASURE_MAX_EDGE_PX),
              widgetContext.baseUrl ?? ""
            )
          },
          widgetContext.photoData,
          prefillMeasures,
          currentPrimaryColor,
          // Il campo «lunghezza piede» compare solo per le scarpe: alle altre
          // categorie non serve, e un campo in più è un motivo in più per non
          // compilare. Se l'analisi non è ancora arrivata il campo non c'è, e
          // il consiglio usa la stima dall'altezza.
          garmentAnalysis?.category === "footwear"
        );
        content.appendChild(form);
        break;
      }
      case "garment_select": {
        const apiKey2 = currentApiKey;
        const baseUrl = widgetContext.baseUrl ?? "";
        const overlay = ensureWidgetModal(() => {
          widgetContext = widgetReducer(widgetContext, { type: "CLOSE" });
          renderState(button);
        });
        const content = overlay.querySelector("[data-cabina-modal-content]");
        if (!content) return;
        content.innerHTML = "";
        restoreDragHandle(content);
        renderBackButton(content, () => {
          widgetContext = widgetReducer(widgetContext, { type: "BACK" });
          renderState(button);
        });
        const garmentSelectStrings = {
          title: getLocaleString("garment_select.title"),
          defaultAction: getLocaleString("garment_select.default_action"),
          browseLabel: getLocaleString("garment_select.browse_label"),
          addToMix: getLocaleString("garment_select.add_to_mix"),
          remove: getLocaleString("garment_select.remove"),
          apply: getLocaleString("garment_select.apply"),
          mixLimitReached: getLocaleString("garment_select.mix_limit_reached"),
          loading: getLocaleString("garment_select.loading"),
          error: getLocaleString("garment_select.error")
        };
        const entryId = ++garmentSelectEntryId;
        const garmentSelectCallbacks = {
          onGarmentsConfirmed: (garments) => {
            if (entryId !== garmentSelectEntryId || widgetContext.state !== "garment_select") return;
            widgetContext = widgetReducer(widgetContext, { type: "GARMENTS_CONFIRMED", garments });
            renderState(button);
          },
          getProductImageUrl: () => extractProductImageUrl(),
          // Risolta al click, attendendo l'analisi se è ancora in volo: montare
          // questo step non garantisce che sia arrivata, e un click veloce
          // partiva con 'auto' (FASHN indovinava il capo, spesso male).
          getProductGarmentParams: () => garmentAnalysisDone.then(() => resolvePageGarmentParams(garmentAnalysis))
        };
        content.appendChild(createGarmentSelect(null, garmentSelectStrings, garmentSelectCallbacks, currentPrimaryColor, widgetContext.selectedGarments));
        const loadingHint = document.createElement("p");
        loadingHint.setAttribute("data-cabina-catalog-loading", "");
        loadingHint.textContent = garmentSelectStrings.loading;
        loadingHint.style.cssText = "margin:8px 0 0;font-size:12px;color:#9ca3af;";
        content.appendChild(loadingHint);
        const catalogPromise = lastCatalog ? Promise.resolve(lastCatalog) : apiKey2 ? fetchCatalog(apiKey2, baseUrl) : Promise.resolve(null);
        catalogPromise.then((catalog) => {
          lastCatalog = catalog;
          if (!content.isConnected) return;
          if (widgetContext.state !== "garment_select") return;
          loadingHint.remove();
          if (!catalog) return;
          content.innerHTML = "";
          restoreDragHandle(content);
          renderBackButton(content, () => {
            widgetContext = widgetReducer(widgetContext, { type: "BACK" });
            renderState(button);
          });
          content.appendChild(createGarmentSelect(catalog, garmentSelectStrings, garmentSelectCallbacks, currentPrimaryColor, widgetContext.selectedGarments));
        });
        break;
      }
      case "rendering": {
        const apiKey2 = currentApiKey;
        const baseUrl = widgetContext.baseUrl ?? "";
        const photoData = widgetContext.photoData;
        ({ ...widgetContext.measures ?? {} });
        if (!apiKey2 || !photoData) {
          widgetContext = widgetReducer(widgetContext, { type: "RENDER_ERROR", error: "Missing data" });
          renderState(button);
          return;
        }
        const attemptGenerative = shouldAttemptGenerative(
          widgetContext.identityMode,
          loadPhotoConsent(apiKey2)
        );
        const overlay = ensureWidgetModal(() => {
          widgetContext = widgetReducer(widgetContext, { type: "CLOSE" });
          renderState(button);
        });
        const content = overlay.querySelector("[data-cabina-modal-content]");
        if (!content) return;
        content.innerHTML = "";
        restoreDragHandle(content);
        const loadingText = getLocaleString("rendering.loading");
        const spinner = document.createElement("div");
        spinner.setAttribute("data-cabina-rendering", "");
        spinner.style.cssText = [
          "display:flex",
          "flex-direction:column",
          "align-items:center",
          "justify-content:center",
          "gap:16px",
          "padding:32px",
          "text-align:center"
        ].join(";");
        const spinnerDot = document.createElement("div");
        spinnerDot.style.cssText = [
          "width:40px",
          "height:40px",
          "border:3px solid #e0e0e0",
          `border-top-color:${currentPrimaryColor}`,
          "border-radius:50%",
          "animation:cabina-spin 0.8s linear infinite"
        ].join(";");
        spinner.appendChild(spinnerDot);
        const label = document.createElement("p");
        label.textContent = loadingText;
        label.style.cssText = "color:#333;font-size:14px;margin:0;";
        spinner.appendChild(label);
        if (garmentAnalysis && CATEGORIE_CON_AVVISO.includes(garmentAnalysis.category) && garmentAnalysis.confidence > 0.7) {
          const note = document.createElement("p");
          note.setAttribute("data-cabina-garment-note", "");
          note.textContent = getLocaleString("garment.not_clothing_note");
          note.style.cssText = "color:#6b7280;font-size:12px;margin:0;";
          spinner.appendChild(note);
        }
        content.appendChild(spinner);
        if (!document.getElementById("cabina-rendering-styles")) {
          const style = document.createElement("style");
          style.id = "cabina-rendering-styles";
          style.textContent = `
          @keyframes cabina-spin {
            to { transform: rotate(360deg); }
          }
        `;
          document.head.appendChild(style);
        }
        const productImageUrl = extractProductImageUrl();
        if (!productImageUrl) {
          widgetContext = widgetReducer(widgetContext, {
            type: "RENDER_ERROR",
            error: "Product image not found"
          });
          renderState(button);
          return;
        }
        const selectedGarments = widgetContext.selectedGarments ?? [
          { imageUrl: productImageUrl, category: "auto" }
        ];
        if (!attemptGenerative) {
          widgetContext = widgetReducer(widgetContext, { type: "RENDER_ERROR", error: "consent" });
          renderState(button);
          return;
        }
        tryonGenerative(apiKey2, baseUrl, photoData, selectedGarments, window.location.href, identitaTryon(apiKey2)).then((esito) => {
          if (!content.isConnected) return;
          if (!esito.ok) {
            widgetContext = widgetReducer(widgetContext, { type: "RENDER_ERROR", error: esito.reason });
            renderState(button);
            return;
          }
          lastTryonResultId = esito.resultId;
          widgetContext = widgetReducer(widgetContext, {
            type: "RENDER_SUCCESS",
            results: [esito.url]
          });
          renderState(button);
        }).catch(() => {
          widgetContext = widgetReducer(widgetContext, { type: "RENDER_ERROR", error: "technical" });
          renderState(button);
        });
        break;
      }
      case "tryon": {
        const renderResult = widgetContext.renderResult;
        if (!renderResult || renderResult.length === 0) {
          widgetContext = widgetReducer(widgetContext, { type: "CLOSE" });
          renderState(button);
          return;
        }
        removeWidgetModal();
        if (!sessionCompleteSent && currentApiKey && currentSessionId) {
          sessionCompleteSent = true;
          notifySessionComplete(currentApiKey, widgetContext.baseUrl ?? "", currentSessionId);
        }
        const apiKeyForCalc = currentApiKey;
        const baseUrlForCalc = widgetContext.baseUrl ?? "";
        showTryOnOverlay(
          renderResult,
          () => {
            widgetContext = widgetReducer(widgetContext, { type: "CLOSE" });
            renderState(button);
          },
          (angleIndex) => {
            widgetContext = widgetReducer(widgetContext, { type: "ANGLE_CHANGED", angle: angleIndex });
          },
          widgetContext.recommendedSize,
          widgetContext.photoData,
          lastCatalog,
          lastTryonResultId,
          apiKeyForCalc ? { apiKey: apiKeyForCalc, baseUrl: baseUrlForCalc, identity: identitaTryon(apiKeyForCalc) } : void 0,
          () => {
            removeTryOnOverlay();
            widgetContext = widgetReducer(widgetContext, { type: "BACK" });
            renderState(button);
          },
          // «Completa il look»: solo se acceso, e partendo dal capo della prima
          // prova — il capo della pagina resta sempre il primo.
          outfitAttivo && widgetContext.selectedGarments?.[0] ? { capoPagina: widgetContext.selectedGarments[0], categoriaPagina: garmentAnalysis?.category ?? null } : void 0
        );
        if (apiKeyForCalc) {
          const hasMeasures = widgetContext.measures != null && (widgetContext.measures.heightCm != null || widgetContext.measures.bustCm != null || widgetContext.measures.waistCm != null || widgetContext.measures.hipsCm != null);
          if (!hasMeasures) {
            widgetContext = { ...widgetContext, recommendedSize: null };
            updateSizeBadge(null);
          } else {
            const measuresForCalc = { ...DEFAULT_MEASURES, ...widgetContext.measures ?? {} };
            const footEstimated = measuresForCalc.footCm == null;
            if (footEstimated) measuresForCalc.footCm = stimaPiedeDaAltezza(measuresForCalc.heightCm);
            fetchSizeTables(apiKeyForCalc, baseUrlForCalc).then((tables) => {
              if (tables && tables.length > 0) {
                const scelta = recommendFromTables(measuresForCalc, tables, {
                  measureSource: widgetContext.measureSource ?? void 0,
                  garment: garmentAnalysis,
                  footEstimated,
                  fit: widgetContext.fit ?? void 0
                });
                console.log(
                  `[widget] size-table=${scelta?.table.name ?? "-"} category=${garmentAnalysis?.category ?? "unknown"} candidate=${scelta?.candidates ?? 0}`
                );
                const recommendation = scelta?.recommendation ?? null;
                widgetContext = { ...widgetContext, recommendedSize: recommendation };
                updateSizeBadge(recommendation);
              }
            });
          }
        }
        break;
      }
      case "closed":
        removeWidgetModal();
        removeTryOnOverlay();
        widgetContext = resetSessionContext(widgetContext);
        break;
      default:
        removeWidgetModal();
        break;
    }
  }
  let bottoneIniettato = null;
  let osservatoreBottone = null;
  let timerReinserimento = null;
  function sorvegliaBottone(config) {
    if (osservatoreBottone || typeof MutationObserver === "undefined") return;
    const osservatore = new MutationObserver(() => {
      if (timerReinserimento || !bottoneIniettato || bottoneIniettato.isConnected) return;
      timerReinserimento = setTimeout(() => {
        timerReinserimento = null;
        if (typeof document === "undefined") return;
        if (bottoneIniettato && !bottoneIniettato.isConnected) {
          bottoneIniettato = null;
          injectButton(config);
        }
      }, 0);
    });
    try {
      osservatore.observe(document.body, { childList: true, subtree: true });
    } catch {
      return;
    }
    osservatoreBottone = osservatore;
  }
  function injectButton(config) {
    if (document.querySelector("[data-cabina-widget-btn]")) return;
    const explicitTarget = document.querySelector(`[${BUTTON_TARGET_ATTR}]`);
    const anchor = explicitTarget ? null : BUTTON_ANCHORS.reduce(
      (found, selector) => {
        if (found) return found;
        try {
          return document.querySelector(selector);
        } catch {
          return null;
        }
      },
      null
    );
    const container = explicitTarget ?? anchor?.parentElement ?? document.body;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = config.buttonText;
    button.setAttribute("data-cabina-widget-btn", "");
    button.style.cssText = [
      `background-color:${sanitizeColor(config.primaryColor)}`,
      "color:#fff",
      "border:none",
      "border-radius:4px",
      "padding:10px 20px",
      "font-size:16px",
      "cursor:pointer",
      "font-family:inherit"
    ].join(";");
    button.addEventListener("click", () => {
      if (!isBrowserSupported()) {
        showUnsupportedTooltip(button);
        return;
      }
      if (widgetContext.state === "idle") {
        if (!sessionStarted && currentApiKey) {
          sessionStarted = true;
          notifySessionStart(currentApiKey, widgetContext.baseUrl ?? "").then((r) => {
            currentSessionId = r.sessionId ?? null;
          }).catch(() => {
          });
        }
        widgetContext = widgetReducer(widgetContext, { type: "OPEN" });
        renderState(button);
      }
    });
    if (anchor && anchor.parentElement === container) {
      anchor.insertAdjacentElement("afterend", button);
    } else {
      container.appendChild(button);
    }
    if (container === document.body) {
      button.style.margin = "16px auto";
      button.style.display = "block";
    } else {
      button.style.marginTop = "12px";
      button.style.display = "block";
      button.style.width = "100%";
      button.style.boxSizing = "border-box";
    }
    bottoneIniettato = button;
    sorvegliaBottone(config);
  }
  async function initWidget(apiKey2, baseUrl = "") {
    if (initStarted) return;
    initStarted = true;
    currentApiKey = apiKey2;
    widgetContext = { ...widgetContext, baseUrl };
    clearMeasurements(apiKey2);
    const config = await fetchWidgetConfig(apiKey2, baseUrl);
    if (!config) return;
    currentLogoUrl = sanitizeLogoUrl(config.logoUrl);
    currentPrimaryColor = sanitizeColor(config.primaryColor);
    outfitAttivo = config.outfitEnabled === true;
    setShowSizeScore(config.showSizeScore === true);
    if (config.widgetDisabled || config.creditsExhausted) {
      return;
    }
    const lang = resolveLanguage(config.defaultLanguage);
    try {
      await loadLocale(lang, baseUrl);
      currentLang = getCurrentLanguage();
    } catch {
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        injectButton(config);
        startGarmentAnalysis(apiKey2, baseUrl);
        apriSeChiestoDallUrl();
      });
    } else {
      injectButton(config);
      startGarmentAnalysis(apiKey2, baseUrl);
      apriSeChiestoDallUrl();
    }
  }
  function arrivaDalNegozio() {
    const referrer = document.referrer;
    if (!referrer) {
      console.debug(
        "[cabina] apertura automatica saltata: nessun referrer. Il link ?cabina=prova e stato aperto direttamente (barra, WhatsApp, mail) oppure il negozio usa Referrer-Policy: no-referrer. Il pulsante di prova resta disponibile in pagina."
      );
      return false;
    }
    let hostReferrer;
    try {
      hostReferrer = new URL(referrer).host;
    } catch {
      console.debug("[cabina] apertura automatica saltata: referrer non interpretabile.");
      return false;
    }
    if (hostReferrer !== window.location.host) {
      console.debug(
        `[cabina] apertura automatica saltata: si arriva da ${hostReferrer}, che non e ${window.location.host}. Aprire conta una sessione del piano, quindi vale solo arrivando da una pagina del negozio stesso.`
      );
      return false;
    }
    return true;
  }
  function apriSeChiestoDallUrl() {
    let url;
    try {
      url = new URL(window.location.href);
    } catch {
      return;
    }
    if (url.searchParams.get(AUTO_OPEN_PARAM) !== AUTO_OPEN_VALUE) return;
    url.searchParams.delete(AUTO_OPEN_PARAM);
    try {
      window.history.replaceState(null, "", url.toString());
    } catch {
    }
    if (!arrivaDalNegozio()) return;
    document.querySelector("[data-cabina-widget-btn]")?.click();
  }
  function startGarmentAnalysis(apiKey2, baseUrl) {
    garmentAnalysis = null;
    const productUrl = extractProductImageUrl();
    if (!productUrl) {
      garmentAnalysisDone = Promise.resolve();
      return;
    }
    garmentAnalysisDone = analyzeGarmentFromUrl(apiKey2, productUrl, baseUrl).then((result) => {
      garmentAnalysis = result;
    }).catch(() => {
      garmentAnalysis = null;
    });
  }
  const script = document.currentScript;
  const srcUrl = script?.src ? new URL(script.src) : null;
  const apiKey = script?.dataset.apiKey ?? srcUrl?.searchParams.get("cabina_api_key") ?? "";
  const apiUrl = script?.dataset.apiUrl ?? srcUrl?.searchParams.get("cabina_api_url") ?? "https://www.cabina.io";
  if (window.__cabinaCaricato) {
    console.warn(
      "[widget] warn=GIA_CARICATO — il bundle Cabina e gia stato eseguito su questa pagina, questa seconda esecuzione si ferma. Probabile doppio tag sul tema (es. vecchio ScriptTag + app embed): rimuoverne uno."
    );
  } else if (apiKey) {
    window.__cabinaCaricato = true;
    initWidget(apiKey, apiUrl).catch(() => {
      console.error("[widget] error=INTERNAL_ERROR");
    });
  } else {
    console.error(
      "[widget] error=WIDGET_CONFIG_MISSING — API key not found. Add data-api-key attribute or cabina_api_key query param to the script tag."
    );
  }
})();
