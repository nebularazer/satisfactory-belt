import conveyorMergerImage from "@/assets/buildables/Desc_ConveyorAttachmentMerger_C.png";
import priorityMergerImage from "@/assets/buildables/Desc_ConveyorAttachmentMergerPriority_C.png";
import programmableSplitterImage from "@/assets/buildables/Desc_ConveyorAttachmentSplitterProgrammable_C.png";
import smartSplitterImage from "@/assets/buildables/Desc_ConveyorAttachmentSplitterSmart_C.png";
import conveyorSplitterImage from "@/assets/buildables/Desc_ConveyorAttachmentSplitter_C.png";
import dronePortImage from "@/assets/buildables/Desc_DroneStation_C.png";
import fluidTruckStationImage from "@/assets/buildables/Desc_FluidTruckStation_C.png";
import resourceWellExtractorImage from "@/assets/buildables/Desc_FrackingExtractor_C.png";
import resourceWellPressurizerImage from "@/assets/buildables/Desc_FrackingSmasher_C.png";
import industrialFluidBufferImage from "@/assets/buildables/Desc_IndustrialTank_C.png";
import minerMk1Image from "@/assets/buildables/Desc_MinerMk1_C.png";
import minerMk2Image from "@/assets/buildables/Desc_MinerMk2_C.png";
import minerMk3Image from "@/assets/buildables/Desc_MinerMk3_C.png";
import oilExtractorImage from "@/assets/buildables/Desc_OilPump_C.png";
import fluidBufferImage from "@/assets/buildables/Desc_PipeStorageTank_C.png";
import pipelineJunctionImage from "@/assets/buildables/Desc_PipelineJunction_Cross_C.png";
import pipelineTJunctionImage from "@/assets/buildables/Desc_PipelineJunction_T_C.png";
import awesomeSinkImage from "@/assets/buildables/Desc_ResourceSink_C.png";
import storageContainerImage from "@/assets/buildables/Desc_StorageContainerMk1_C.png";
import industrialStorageContainerImage from "@/assets/buildables/Desc_StorageContainerMk2_C.png";
import fluidFreightPlatformImage from "@/assets/buildables/Desc_TrainDockingStationLiquid_C.png";
import freightPlatformImage from "@/assets/buildables/Desc_TrainDockingStation_C.png";
import truckStationImage from "@/assets/buildables/Desc_TruckStation_C.png";
import waterExtractorImage from "@/assets/buildables/Desc_WaterPump_C.png";
import assemblerImage from "@/assets/machines/Desc_AssemblerMk1_C.png";
import blenderImage from "@/assets/machines/Desc_Blender_C.png";
import constructorImage from "@/assets/machines/Desc_ConstructorMk1_C.png";
import converterImage from "@/assets/machines/Desc_Converter_C.png";
import foundryImage from "@/assets/machines/Desc_FoundryMk1_C.png";
import biomassBurnerImage from "@/assets/machines/Desc_GeneratorBiomass_Automated_C.png";
import coalGeneratorImage from "@/assets/machines/Desc_GeneratorCoal_C.png";
import fuelGeneratorImage from "@/assets/machines/Desc_GeneratorFuel_C.png";
import geothermalGeneratorImage from "@/assets/machines/Desc_GeneratorGeoThermal_C.png";
import nuclearPowerPlantImage from "@/assets/machines/Desc_GeneratorNuclear_C.png";
import particleAcceleratorImage from "@/assets/machines/Desc_HadronCollider_C.png";
import manufacturerImage from "@/assets/machines/Desc_ManufacturerMk1_C.png";
import refineryImage from "@/assets/machines/Desc_OilRefinery_C.png";
import packagerImage from "@/assets/machines/Desc_Packager_C.png";
import quantumEncoderImage from "@/assets/machines/Desc_QuantumEncoder_C.png";
import smelterImage from "@/assets/machines/Desc_SmelterMk1_C.png";

const BUILDABLE_IMAGE_URLS = new Map<string, string>([
  ["Build_AssemblerMk1_C", assemblerImage],
  ["Build_Blender_C", blenderImage],
  ["Build_ConstructorMk1_C", constructorImage],
  ["Build_Converter_C", converterImage],
  ["Build_ConveyorAttachmentMerger_C", conveyorMergerImage],
  ["Build_ConveyorAttachmentMergerPriority_C", priorityMergerImage],
  ["Build_ConveyorAttachmentSplitter_C", conveyorSplitterImage],
  ["Build_ConveyorAttachmentSplitterProgrammable_C", programmableSplitterImage],
  ["Build_ConveyorAttachmentSplitterSmart_C", smartSplitterImage],
  ["Build_DroneStation_C", dronePortImage],
  ["Build_FluidTruckStation_C", fluidTruckStationImage],
  ["Build_FoundryMk1_C", foundryImage],
  ["Build_FrackingExtractor_C", resourceWellExtractorImage],
  ["Build_FrackingSmasher_C", resourceWellPressurizerImage],
  ["Build_GeneratorBiomass_Automated_C", biomassBurnerImage],
  ["Build_GeneratorCoal_C", coalGeneratorImage],
  ["Build_GeneratorFuel_C", fuelGeneratorImage],
  ["Build_GeneratorGeoThermal_C", geothermalGeneratorImage],
  ["Build_GeneratorNuclear_C", nuclearPowerPlantImage],
  ["Build_HadronCollider_C", particleAcceleratorImage],
  ["Build_IndustrialTank_C", industrialFluidBufferImage],
  ["Build_ManufacturerMk1_C", manufacturerImage],
  ["Build_MinerMk1_C", minerMk1Image],
  ["Build_MinerMk2_C", minerMk2Image],
  ["Build_MinerMk3_C", minerMk3Image],
  ["Build_OilPump_C", oilExtractorImage],
  ["Build_OilRefinery_C", refineryImage],
  ["Build_Packager_C", packagerImage],
  ["Build_PipeStorageTank_C", fluidBufferImage],
  ["Build_PipelineJunction_Cross_C", pipelineJunctionImage],
  ["Build_PipelineJunction_T_C", pipelineTJunctionImage],
  ["Build_QuantumEncoder_C", quantumEncoderImage],
  ["Build_ResourceSink_C", awesomeSinkImage],
  ["Build_SmelterMk1_C", smelterImage],
  ["Build_StorageContainerMk1_C", storageContainerImage],
  ["Build_StorageContainerMk2_C", industrialStorageContainerImage],
  ["Build_TrainDockingStation_C", freightPlatformImage],
  ["Build_TrainDockingStationLiquid_C", fluidFreightPlatformImage],
  ["Build_TruckStation_C", truckStationImage],
  ["Build_WaterPump_C", waterExtractorImage],
]);

export function buildableImageUrl(buildableId: string) {
  return BUILDABLE_IMAGE_URLS.get(buildableId);
}

export function descriptorImageUrl(descriptorId: string) {
  return `${import.meta.env.BASE_URL}items/${descriptorId}.png`;
}
