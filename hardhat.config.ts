import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url: "https://eth-sepolia.g.alchemy.com/v2/chL87jzrfXklYJR_OmMTNKc1Ab1OfQpT",
      accounts: ["0x124e0c16a265598511da6d0ff49fbb6e0f2e4b792472d1b42050acbcea3f51c9"],
    },
  },
};

export default config;
