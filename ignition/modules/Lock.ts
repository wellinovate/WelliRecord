import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const WellRecordModule = buildModule("WellRecordModule", (m) => {
  // Deploy WelliIDRegistry first
  const welli = m.contract("WelliIDRegistry", []);

  // Then deploy AccessControlRegistry
  const accessControl = m.contract("AccessControlRegistry", []);

  // After deploy, you can connect them using setWelliIDRegistry and setDataRegistry if needed
  // For example, if you had a DataRegistry, you could add:
  // m.call(accessControl, "setDataRegistry", [dataRegistry]);
  // m.call(accessControl, "setWelliIDRegistry", [welli]);

  // return { welli, accessControl };
  return { welli };
});

export default WellRecordModule;
