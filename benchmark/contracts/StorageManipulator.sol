// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract StorageManipulator {
    mapping(uint256 => string) public dataStore;
    mapping(uint256 => uint256) public numberStore;

    event DataStored(uint256 indexed id, string data);
    event CalculationDone(uint256 a, uint256 b, uint256 result);

    function writeData(uint256 id, string memory dataString) public {
        dataStore[id] = dataString;
        emit DataStored(id, dataString);
    }

    function readData(uint256 id) public view returns (string memory) {
        return dataStore[id];
    }

    // Example of a slightly more computational function
    function performComplexCalculation(uint256 a, uint256 b, uint256 iterations) public returns (uint256) {
        uint256 result = 0;
        for (uint i = 0; i < iterations; i++) {
            result += (a * b) / (i + 1); // Arbitrary calculation
        }
        numberStore[a+b] = result; // Store some result
        emit CalculationDone(a, b, result);
        return result;
    }
}