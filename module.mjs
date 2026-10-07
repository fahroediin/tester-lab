// @ts-check
import { module } from "@prisma/composer";
import testerLabService from "./service.mjs";

export default module("tester-lab-poc", ({ provision }) => {
  provision(testerLabService, { id: "testerlab" });
});
